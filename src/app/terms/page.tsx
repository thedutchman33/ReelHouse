import type { Metadata } from "next";
import GmailLink from "@/components/common/GmailLink";
import LegalPage, { LegalList, LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules for using Reelhouse, including accounts, content and third-party streams.",
};

const LINK = "font-medium text-primary transition hover:underline";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <LegalSection title="Terms of Service for Reelhouse">
        <p>
          These Terms of Service govern your access to and use of Reelhouse. Please read
          them carefully before using the website.
        </p>
      </LegalSection>

      <LegalSection title="Acceptance of Terms">
        <p>
          By accessing and using Reelhouse, you agree to be bound by these Terms of
          Service. If you do not agree with any part of these terms, you should not use
          our website.
        </p>
      </LegalSection>

      <LegalSection title="Use of the Website">
        <p>
          You agree to use the website only for lawful purposes and in a way that does not
          harm, disrupt or interfere with the website or other users. You must not:
        </p>
        <LegalList
          items={[
            "Attempt to gain unauthorized access to the website or its systems.",
            "Use bots or automated systems to abuse the website or its providers.",
            "Upload or distribute malicious code or harmful content.",
            "Copy or distribute website content without permission.",
            "Use the website for illegal activities.",
            "Interfere with another person's use or enjoyment of the website.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          If you create an account, you are responsible for maintaining the security of
          your account and password, and for all activity that occurs under your account.
          You must provide accurate information and notify us promptly if you believe your
          account has been compromised.
        </p>
      </LegalSection>

      <LegalSection title="Content and Third-Party Streams">
        <p>
          Reelhouse is a content-discovery and indexing service. We do not host, store,
          encode, mirror or transmit video files. Playback is loaded from independent
          third-party providers that we do not own or control.
        </p>
        <p>
          Metadata and artwork are provided for informational and entertainment purposes.
          We do not guarantee the accuracy, reliability, legality or availability of any
          title, stream or third-party source, and we may remove content or restrict
          access at any time without notice.
        </p>
      </LegalSection>

      <LegalSection title="Intellectual Property">
        <p>
          The Reelhouse name, logo, interface and original site content are protected by
          applicable intellectual property laws. You may not use our branding or original
          content in a way that suggests endorsement or affiliation without our written
          permission.
        </p>
      </LegalSection>

      <LegalSection title="Third-Party Links and Ads">
        <p>
          Our website may contain links to third-party websites, players or advertisements.
          We are not responsible for the content, privacy policies, availability or
          practices of any third-party websites or services. Access them at your own risk.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimer of Warranties">
        <p>
          The website is provided on an &quot;as is&quot; and &quot;as available&quot;
          basis. To the fullest extent permitted by law, Reelhouse disclaims all warranties,
          whether express or implied, including warranties of merchantability, fitness for
          a particular purpose and non-infringement.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of Liability">
        <p>
          Reelhouse will not be held responsible for any damages, losses or issues that may
          occur from using the website, including loss of data, interruption of service or
          exposure to third-party content. Use the website at your own risk.
        </p>
      </LegalSection>

      <LegalSection title="Changes to These Terms">
        <p>
          We may update or change these Terms of Service at any time without prior notice.
          By continuing to use the website after changes are posted, you agree to the
          updated terms.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          We reserve the right to suspend or terminate access to the website for any user
          who violates these terms or uses the service in a way that could harm Reelhouse,
          its users or third parties.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          If you have any questions about these Terms of Service, you can contact us at{" "}
          <GmailLink subject="Reelhouse terms inquiry" className={LINK}>
            {CONTACT_EMAIL}
          </GmailLink>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
