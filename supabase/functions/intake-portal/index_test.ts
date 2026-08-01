import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

// Simple unit test for the base64 helper that is easy to exercise without
// importing the full handler (which calls serve() at module load time).
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.test("arrayBufferToBase64 encodes simple text", () => {
  const input = new TextEncoder().encode("hello intake");
  assertEquals(arrayBufferToBase64(input.buffer), "aGVsbG8gaW50YWtl");
});

Deno.test("required environment variables are present", () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  assertEquals(typeof url, "string");
  assertEquals(typeof key, "string");
  assertEquals(url!.length > 0, true);
  assertEquals(key!.length > 0, true);
});
