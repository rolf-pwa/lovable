// Quarterly Governance Audit -- Phase 2: document extraction.
//
// Given a household, resolves its Vault's "01 Identity & Legal" and
// "02 Estate (Wills, POA, Trusts)" category folders (via the same
// matchVaultCategoryFolder helper computeVaultReadiness already uses, so
// the two never drift on what "the Identity & Legal folder" means) and
// extracts structured Investor Risk Profile / Will-legal facts from every
// PDF found there, via Gemini's native PDF input. This is a genuine
// simplification over the prototype being ported (a working standalone
// Python CLI, /Users/admin/Downloads/Review Agent): it rasterizes every PDF
// page to PNG specifically to work around Claude's lack of native PDF
// input; Gemini accepts PDFs directly, so that whole step disappears.
//
// Schemas/prompts translated field-for-field from the prototype's
// schemas/investor_profile.py, schemas/legal.py, and
// agent/tools/extract.py's INVESTOR_PROFILE_PROMPT/LEGAL_PROMPT -- adapted
// to drop the prototype's "use the read_pdf_pages tool" framing (Gemini
// gets the whole PDF natively in one shot) and to have the model flag a
// clearly-wrong document type rather than force a poor-fit answer, since
// folder placement alone is a naive classifier (a later phase could add
// real document classification; this phase doesn't attempt it).
//
// SourceRef.file_path/file_name/page_numbers are always built server-side
// from the real Drive file, never trusted from the model -- same
// never-trust-AI-generated-identifiers principle daily-briefing-generate's
// link resolution already established for this codebase.
//
// Writes results into a new governance_audits row's `computed` JSONB
// (investor_profiles, legal_facts, extraction_errors). Phase 3+ (calc,
// narrative, staff UI) will read this. Staff-triggered only for now, no
// cron -- this phase is deliberately scoped to extraction, not the full
// pipeline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceGoogleAccessToken } from "../_shared/google-token.ts";
import { driveDownloadFile, driveListChildren, matchVaultCategoryFolder } from "../_shared/vault-provisioning.ts";
import { generateVertexContent, parseServiceAccountKey, type ServiceAccountKey, type VertexContent } from "../_shared/vertex-ai.ts";

const ALLOWED_ORIGINS = [
  "https://prosperwise-portal.web.app",
  "https://prosperwise.lovable.app",
  "https://app.prosperwise.ca",
  "https://id-preview--339dfc8f-3e82-4b05-8a36-a9f66fc58449.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// deno-lint-ignore no-explicit-any
type Db = ReturnType<typeof createClient<any>>;

function admin(): Db {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function requireStaff(req: Request): Promise<{ userId: string; error?: undefined } | { error: string }> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return { error: "Missing authorization header" };
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabaseUser.auth.getUser();
  if (error || !data?.user) return { error: "Not authenticated" };
  if (!data.user.email?.endsWith("@prosperwise.ca")) return { error: "Not authorized" };
  return { userId: data.user.id };
}

// -- Schemas, translated field-for-field from the prototype's pydantic models --
// (source is deliberately NOT part of what the model returns -- built server-side, see above)

interface SourceRef {
  file_path: string;
  file_name: string;
  page_numbers: number[];
}

interface InvestorProfile {
  client_name: string | null;
  account_number: string | null;
  form_id: string | null;
  date_signed: string | null;
  total_points: number | null;
  profile_category: string | null;
  stated_choice_of_investments: string | null;
  choice_matches_profile: boolean | null;
  reason_for_mismatch: string | null;
  source: SourceRef;
}

interface NamedParty {
  name: string;
  role: string;
  relationship: string | null;
}
interface BeneficiaryDesignation {
  beneficiary_name: string;
  asset_or_share_description: string;
}
interface KeyClause {
  clause_ref: string | null;
  summary: string;
}

interface LegalDocFacts {
  document_type: string;
  testator_or_grantor_name: string | null;
  date_executed: string | null;
  jurisdiction: string | null;
  parties: NamedParty[];
  beneficiary_designations: BeneficiaryDesignation[];
  key_clauses: KeyClause[];
  notes: string | null;
  source: SourceRef;
}

const INVESTOR_PROFILE_PROMPT = `The attached PDF is (or may be) an Investor Risk Profile questionnaire \
(e.g. a form like "F51-122A"). Read the whole document.

Transcribe it into the given schema, including the account_number this profile was completed for (look \
for "Existing Annuity Contract" or a similar contract-number field), the total_points from the "Points \
for this profile" box, the resulting profile_category, and whether the client's stated \
choice_of_investments matches their calculated profile.

If this document is clearly NOT an Investor Risk Profile questionnaire, still call the function, but \
leave every other field null and set profile_category to "NOT_APPLICABLE" so the caller can tell it \
didn't match.`;

const LEGAL_PROMPT = `The attached PDF is (or may be) a Will or other legal/estate document (it may be a \
scanned image with no text layer -- read it visually page by page; Wills are often 5-10 pages).

Transcribe it into the given schema. In particular:
- parties: executor(s)/trustee(s) (including named alternates and the conditions that trigger them), \
powers of attorney, and any other named role-holders.
- beneficiary_designations: who receives what, as directed by the document.
- key_clauses: any clause that creates a specific right, restriction, or condition worth an advisor's \
attention for financial/estate planning purposes (e.g. a spousal life interest in the home, a trust \
condition, a specific bequest) -- reference the clause number if the document numbers its clauses, and \
describe factually what it does, not why it matters.

If this document is clearly NOT a Will/legal/estate document, still call the function, but set \
document_type to "NOT_APPLICABLE" and leave every other field null/empty.`;

const INVESTOR_PROFILE_TOOL_SCHEMA = {
  functionDeclarations: [
    {
      name: "extract_investor_profile",
      description: "Extract structured data from an Investor Risk Profile questionnaire PDF.",
      parameters: {
        type: "OBJECT",
        properties: {
          client_name: { type: "STRING" },
          account_number: { type: "STRING" },
          form_id: { type: "STRING", description: 'e.g. "F51-122A(23-11)".' },
          date_signed: { type: "STRING", description: "ISO date (YYYY-MM-DD) if determinable." },
          total_points: { type: "INTEGER" },
          profile_category: {
            type: "STRING",
            description: 'e.g. "Prudent", "Moderate", "Balanced", "Growth", "Aggressive", or "NOT_APPLICABLE".',
          },
          stated_choice_of_investments: { type: "STRING" },
          choice_matches_profile: { type: "BOOLEAN" },
          reason_for_mismatch: { type: "STRING" },
        },
        required: ["profile_category"],
      },
    },
  ],
};

const LEGAL_FACTS_TOOL_SCHEMA = {
  functionDeclarations: [
    {
      name: "extract_legal_facts",
      description: "Extract structured facts from a Will or other legal/estate document PDF.",
      parameters: {
        type: "OBJECT",
        properties: {
          document_type: {
            type: "STRING",
            description: '"Will", "Power of Attorney", "Representation Agreement", etc., or "NOT_APPLICABLE".',
          },
          testator_or_grantor_name: { type: "STRING" },
          date_executed: { type: "STRING", description: "ISO date if determinable, else free text (e.g. \"April 2025\")." },
          jurisdiction: { type: "STRING", description: 'e.g. "British Columbia".' },
          parties: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                role: { type: "STRING", description: '"Executor/Trustee", "Alternate Executor", "Power of Attorney", "Beneficiary", ...' },
                relationship: { type: "STRING", description: 'e.g. "husband", "daughter".' },
              },
              required: ["name", "role"],
            },
          },
          beneficiary_designations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                beneficiary_name: { type: "STRING" },
                asset_or_share_description: { type: "STRING", description: 'e.g. "residue of estate, equally", "specific bequest of $X".' },
              },
              required: ["beneficiary_name", "asset_or_share_description"],
            },
          },
          key_clauses: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                clause_ref: { type: "STRING", description: 'e.g. "Clause 9(a)".' },
                summary: { type: "STRING", description: "Plain-language, factual summary of what the clause does." },
              },
              required: ["summary"],
            },
          },
          notes: { type: "STRING" },
        },
        required: ["document_type"],
      },
    },
  ],
};

const MAX_PDF_BYTES = 15 * 1024 * 1024; // stay well under Vertex's ~20MB inline-request cap
const MAX_PDFS_PER_FOLDER = 5; // bounds one edge function invocation's runtime/cost

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function extractFromPdf(
  sa: ServiceAccountKey,
  prompt: string,
  toolSchema: Record<string, unknown>,
  functionName: string,
  pdfBytes: ArrayBuffer,
  // deno-lint-ignore no-explicit-any
): Promise<Record<string, any> | null> {
  const contents: VertexContent[] = [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "application/pdf", data: arrayBufferToBase64(pdfBytes) } },
      ],
    },
  ];
  const result = await generateVertexContent(
    sa,
    "gemini-2.5-flash",
    contents,
    { temperature: 0, maxOutputTokens: 4096 },
    { tools: [toolSchema], toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [functionName] } } },
  );
  // deno-lint-ignore no-explicit-any
  const parts = result?.candidates?.[0]?.content?.parts as any[] | undefined;
  const call = parts?.find((p) => p.functionCall)?.functionCall;
  if (!call || call.name !== functionName) return null;
  return call.args ?? {};
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

async function extractCategory<T>(
  db: Db,
  sa: ServiceAccountKey,
  accessToken: string,
  rootChildren: DriveFile[],
  displayName: string,
  prompt: string,
  toolSchema: Record<string, unknown>,
  functionName: string,
  // deno-lint-ignore no-explicit-any
  isApplicable: (args: Record<string, any>) => boolean,
  // deno-lint-ignore no-explicit-any
  buildResult: (args: Record<string, any>, source: SourceRef) => T,
  errors: string[],
): Promise<T[]> {
  const folder = matchVaultCategoryFolder(rootChildren, displayName);
  if (!folder) return [];

  const pdfs = (await driveListChildren(folder.id, accessToken))
    .filter((f) => f.mimeType === "application/pdf")
    .slice(0, MAX_PDFS_PER_FOLDER);

  const results: T[] = [];
  for (const pdf of pdfs) {
    try {
      const bytes = await driveDownloadFile(pdf.id, accessToken);
      if (bytes.byteLength > MAX_PDF_BYTES) {
        errors.push(`${pdf.name}: skipped, larger than ${MAX_PDF_BYTES / (1024 * 1024)}MB`);
        continue;
      }
      const args = await extractFromPdf(sa, prompt, toolSchema, functionName, bytes);
      if (args && isApplicable(args)) {
        results.push(buildResult(args, { file_path: `${displayName}/${pdf.name}`, file_name: pdf.name, page_numbers: [] }));
      }
    } catch (e) {
      errors.push(`${pdf.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return results;
}

async function runExtraction(
  db: Db,
  householdId: string,
  userId: string,
): Promise<{ auditId: string; investorProfiles: InvestorProfile[]; legalFacts: LegalDocFacts[]; errors: string[] }> {
  const { data: audit, error: insertErr } = await db
    .from("governance_audits")
    .insert({ household_id: householdId, created_by: userId, generation_status: "generating" })
    .select("id")
    .single();
  if (insertErr || !audit) throw new Error(`Failed to create audit row: ${insertErr?.message}`);
  const auditId = audit.id as string;

  try {
    const { data: household } = await db
      .from("households")
      .select("vault_root_folder_id")
      .eq("id", householdId)
      .maybeSingle();
    const vaultRootFolderId = (household?.vault_root_folder_id as string | null) ?? null;

    if (!vaultRootFolderId) {
      await db
        .from("governance_audits")
        .update({ generation_status: "error", generation_error: "This household's Vault is not yet provisioned." })
        .eq("id", auditId);
      return { auditId, investorProfiles: [], legalFacts: [], errors: [] };
    }

    const sa = await parseServiceAccountKey(Deno.env.get("GCP_SERVICE_ACCOUNT_KEY"));
    const accessToken = await getServiceGoogleAccessToken(db);
    const rootChildren = await driveListChildren(vaultRootFolderId, accessToken);

    const { data: templates } = await db
      .from("vault_folder_templates")
      .select("display_name, slug")
      .eq("is_active", true)
      .in("slug", ["identity-legal", "estate"]);
    const templateBySlug = new Map(
      // deno-lint-ignore no-explicit-any
      ((templates ?? []) as any[]).map((t) => [t.slug as string, t.display_name as string]),
    );

    const errors: string[] = [];
    const investorProfiles: InvestorProfile[] = [];
    const legalFacts: LegalDocFacts[] = [];

    const identityLegalDisplayName = templateBySlug.get("identity-legal");
    if (identityLegalDisplayName) {
      investorProfiles.push(
        ...(await extractCategory<InvestorProfile>(
          db,
          sa,
          accessToken,
          rootChildren,
          identityLegalDisplayName,
          INVESTOR_PROFILE_PROMPT,
          INVESTOR_PROFILE_TOOL_SCHEMA,
          "extract_investor_profile",
          (args) => Boolean(args.profile_category) && args.profile_category !== "NOT_APPLICABLE",
          (args, source) => ({
            client_name: args.client_name ?? null,
            account_number: args.account_number ?? null,
            form_id: args.form_id ?? null,
            date_signed: args.date_signed ?? null,
            total_points: typeof args.total_points === "number" ? args.total_points : null,
            profile_category: args.profile_category ?? null,
            stated_choice_of_investments: args.stated_choice_of_investments ?? null,
            choice_matches_profile: typeof args.choice_matches_profile === "boolean" ? args.choice_matches_profile : null,
            reason_for_mismatch: args.reason_for_mismatch ?? null,
            source,
          }),
          errors,
        )),
      );
    }

    const estateDisplayName = templateBySlug.get("estate");
    if (estateDisplayName) {
      legalFacts.push(
        ...(await extractCategory<LegalDocFacts>(
          db,
          sa,
          accessToken,
          rootChildren,
          estateDisplayName,
          LEGAL_PROMPT,
          LEGAL_FACTS_TOOL_SCHEMA,
          "extract_legal_facts",
          (args) => Boolean(args.document_type) && args.document_type !== "NOT_APPLICABLE",
          (args, source) => ({
            document_type: args.document_type,
            testator_or_grantor_name: args.testator_or_grantor_name ?? null,
            date_executed: args.date_executed ?? null,
            jurisdiction: args.jurisdiction ?? null,
            parties: Array.isArray(args.parties) ? args.parties : [],
            beneficiary_designations: Array.isArray(args.beneficiary_designations) ? args.beneficiary_designations : [],
            key_clauses: Array.isArray(args.key_clauses) ? args.key_clauses : [],
            notes: args.notes ?? null,
            source,
          }),
          errors,
        )),
      );
    }

    const status: "complete" | "error" =
      investorProfiles.length === 0 && legalFacts.length === 0 && errors.length > 0 ? "error" : "complete";

    await db
      .from("governance_audits")
      .update({
        generation_status: status,
        generation_error: errors.length > 0 ? errors.join("; ") : null,
        computed: { investor_profiles: investorProfiles, legal_facts: legalFacts, extraction_errors: errors },
        generated_at: new Date().toISOString(),
      })
      .eq("id", auditId);

    return { auditId, investorProfiles, legalFacts, errors };
  } catch (e) {
    await db
      .from("governance_audits")
      .update({ generation_status: "error", generation_error: e instanceof Error ? e.message : String(e) })
      .eq("id", auditId);
    throw e;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const auth = await requireStaff(req);
  if (auth.error) return json({ error: auth.error }, 401);

  const body = await req.json().catch(() => ({}));
  const householdId = String(body?.household_id || "");
  if (!householdId) return json({ error: "household_id is required" }, 400);

  try {
    const result = await runExtraction(admin(), householdId, auth.userId);
    return json(result);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
