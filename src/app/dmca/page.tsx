import type { Metadata } from "next";
import GmailLink from "@/components/common/GmailLink";
import LegalPage, { LegalList, LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "DMCA Policy",
  description:
    "How to submit a copyright takedown notice to Reelhouse under the Digital Millennium Copyright Act.",
};

const LINK = "font-medium text-primary transition hover:underline";

export default function DmcaPage() {
  return (
    <LegalPage title="DMCA Policy">
      <LegalSection title="Copyright and Takedown Policy">
        <p>
          Reelhouse is committed to complying with the Digital Millennium Copyright Act
          (DMCA), 17 U.S.C. § 512, and respects the intellectual property rights of others.
          We respond to valid copyright infringement notices and take appropriate action in
          accordance with applicable intellectual property laws.
        </p>
        <p>
          If your copyrighted material has been posted on Reelhouse without authorization,
          or if hyperlinks to your copyrighted content appear through our platform, you may
          submit a copyright infringement claim containing the information listed below.
        </p>
      </LegalSection>

      <LegalSection title="Required Information for a DMCA Takedown Request">
        <LegalList
          items={[
            <>
              <strong className="text-foreground">Full name of the copyrighted work:</strong>{" "}
              clearly identify the material you believe has been infringed.
            </>,
            <>
              <strong className="text-foreground">Direct URL(s):</strong> provide the exact
              Reelhouse URL(s) where the allegedly infringing material is located.
            </>,
            <>
              <strong className="text-foreground">Company name:</strong> if submitting on
              behalf of a company, include its full legal name.
            </>,
            <>
              <strong className="text-foreground">Personal information:</strong> your full
              legal name and position, if applicable.
            </>,
            <>
              <strong className="text-foreground">Contact information:</strong> a valid
              email address and phone number.
            </>,
            <>
              <strong className="text-foreground">Good faith statement:</strong> a statement
              that you believe the use is not authorized by the copyright owner, its agent
              or the law.
            </>,
            <>
              <strong className="text-foreground">Accuracy and authority statement:</strong>{" "}
              a statement under penalty of perjury that the information is accurate and that
              you are authorized to act on behalf of the copyright owner.
            </>,
            <>
              <strong className="text-foreground">Signature:</strong> a physical or
              electronic signature of the authorized person.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="How to Submit a DMCA Notice">
        <p>
          Please send your infringement notice via email with the subject line{" "}
          <strong className="text-foreground">&quot;DMCA Infringement&quot;</strong> to{" "}
          <GmailLink
            subject="DMCA Infringement"
            className={LINK}
          >
            {CONTACT_EMAIL}
          </GmailLink>
          .
        </p>
        <p>
          Takedown requests are processed within 7–30 days. If you do not receive a reply
          within this timeframe, please refresh the page — the material may already have
          been removed. In most cases, reported links are removed promptly after a valid
          notice is received.
        </p>
        <p>
          Repeated notices for the same content may increase response time. Please wait
          before resubmitting.
        </p>
      </LegalSection>

      <LegalSection title="Important Notice">
        <p>
          Knowingly submitting false copyright infringement claims may result in legal
          consequences, including liability for damages, costs and attorney&apos;s fees
          under 17 U.S.C. § 512(f).
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers">
        <LegalList
          items={[
            "Reelhouse is an indexing website that only contains links to third-party platforms. We do not host files on our servers.",
            "All content and links are collected from publicly available sources.",
            "We strongly encourage users to purchase media content from official creators and distributors.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          For copyright questions or a notice that does not fit the form above, contact us
          at{" "}
          <GmailLink subject="Reelhouse DMCA inquiry" className={LINK}>
            {CONTACT_EMAIL}
          </GmailLink>
          .
        </p>
      </LegalSection>

    </LegalPage>
  );
}
