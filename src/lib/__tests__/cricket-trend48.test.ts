import { describe, expect, it } from "vitest";
import {
  decodeTrend48Loader,
  decodeTrend48Ticket,
  trend48ChannelSlug,
} from "@/lib/cricket-trend48";

// ---------------------------------------------------------------------------
// Trend48 rotates its relay variable names and XOR/offset pair on every
// response. These tests pin the two decoders so a relay change fails here
// instead of turning into a black player in production.
// ---------------------------------------------------------------------------

function encodeLoader(text: string, xor: number, offset: number): string {
  const values = Array.from(text, (character) => {
    return ((character.charCodeAt(0) + offset) % 256) ^ xor;
  });
  return `(function(){var _h=[${values.join(
    ","
  )}],_k=${xor},_o=${offset},_s="",_i;for(_i=0;_i<_h.length;_i++){_s+=String.fromCharCode(((_h[_i]^_k)-_o+256)%256);}window["ev"+"al"](_s);})();`;
}

function encodeTicket(ticketUrl: string, text: string, seed: number): Uint8Array {
  const key = ticketUrl.slice(ticketUrl.lastIndexOf("/") + 1);
  const bytes = new Uint8Array(text.length + 1);
  bytes[0] = seed;
  for (let index = 0; index < text.length; index++) {
    bytes[index + 1] =
      text.charCodeAt(index) ^
      key.charCodeAt(index % key.length) ^
      ((seed + index) & 0xff);
  }
  return bytes;
}

describe("trend48 channel URLs", () => {
  it("reads the channel slug from a Live TV URL", () => {
    expect(
      trend48ChannelSlug(
        "https://trend48.st/live-tv?ch=skysportscricket-uk"
      )
    ).toBe("skysportscricket-uk");
    expect(
      trend48ChannelSlug("https://trend48.st/live-tv?ch=willow2-usa&x=1")
    ).toBe("willow2-usa");
  });

  it("rejects other origins, paths and malformed slugs", () => {
    expect(
      trend48ChannelSlug("http://trend48.st/live-tv?ch=willow-usa")
    ).toBeNull();
    expect(
      trend48ChannelSlug("https://trend48.st.evil.test/live-tv?ch=willow-usa")
    ).toBeNull();
    expect(
      trend48ChannelSlug("https://trend48.st/event/willow-usa")
    ).toBeNull();
    expect(trend48ChannelSlug("https://trend48.st/live-tv")).toBeNull();
    expect(
      trend48ChannelSlug("https://trend48.st/live-tv?ch=../../etc/passwd")
    ).toBeNull();
  });
});

describe("trend48 relay decoding", () => {
  it("decodes the rotating loader script", () => {
    const text = `loadStreamUrl("https://tims-001.sytes.net/p/0123456789abcdef", function (url) {
      window.jwplayer("player").setup({ file: url });
    });`;
    expect(decodeTrend48Loader(encodeLoader(text, 50, 218))).toBe(text);
    expect(decodeTrend48Loader(encodeLoader(text, 183, 7))).toBe(text);
  });

  it("rejects a script without the loader shape", () => {
    expect(decodeTrend48Loader("<script>alert(1)</script>")).toBeNull();
    expect(
      decodeTrend48Loader(`var _h=[1,2,"x"],_k=50,_o=218,_s="";`)
    ).toBeNull();
  });

  it("decodes the binary ticket into a signed manifest", () => {
    const ticketUrl =
      "https://tims-001.sytes.net/p/0123456789abcdef0123456789abcdef";
    const streamUrl =
      "https://tims-001.sytes.net/main/secure/abc123/1793772905/skysportscricket-uk.m3u8";
    expect(
      decodeTrend48Ticket(ticketUrl, encodeTicket(ticketUrl, streamUrl, 42))
    ).toBe(streamUrl);
  });

  it("rejects an empty ticket", () => {
    expect(
      decodeTrend48Ticket("https://tims-001.sytes.net/p/abc", new Uint8Array())
    ).toBeNull();
    expect(
      decodeTrend48Ticket(
        "https://tims-001.sytes.net/p/abc",
        new Uint8Array([1])
      )
    ).toBeNull();
  });
});
