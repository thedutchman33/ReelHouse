import type { Metadata } from "next";
import GmailLink from "@/components/common/GmailLink";
import LegalPage, { LegalList, LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Legal & Privacy",
  description:
    "How Reelhouse handles personal information, cookies, accounts and third-party services.",
};

const LINK = "font-medium text-primary transition hover:underline";

export default function LegalPageRoute() {
  return (
    <LegalPage title="Privacy Policy">
      <LegalSection title="Privacy Policy for Reelhouse">
        <p>
          At Reelhouse, we value the privacy of our visitors. This Privacy Policy explains
          what information we collect, how we use it, and how we protect it when you use
          our website.
        </p>
      </LegalSection>

      <LegalSection title="Consent">
        <p>
          By accessing and using Reelhouse, you agree to this Privacy Policy and its
          terms. If you do not agree, please stop using the website.
        </p>
      </LegalSection>

      <LegalSection title="Information We Collect">
        <p>
          We collect information you provide directly, information created when you use
          Reelhouse, and limited technical information from your browser.
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-foreground">Account information.</strong> If you
              create an account, we collect your email address and any username or avatar
              you choose to add.
            </>,
            <>
              <strong className="text-foreground">Contact information.</strong> If you
              contact us, we receive your name, email address, message and any attachments
              you include.
            </>,
            <>
              <strong className="text-foreground">Library data.</strong> Continue-watching
              and watchlist data are stored in your browser by default. If you sign in,
              they may be synced to your account so they follow you across devices.
            </>,
            <>
              <strong className="text-foreground">Technical information.</strong> We may
              receive your IP address, browser type, device information, referring pages,
              pages visited and approximate region.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="How We Use Your Information">
        <LegalList
          items={[
            "To operate, maintain and secure the website.",
            "To create and manage accounts and sync your library across devices.",
            "To improve the catalog, recommendations and overall user experience.",
            "To respond to feedback, support requests and legal notices.",
            "To understand how visitors use the website and fix problems.",
            "To detect fraud, abuse and unauthorized activity.",
            "To comply with applicable legal obligations.",
          ]}
        />
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection title="Log Files">
        <p>
          Reelhouse uses standard log files. These files record visitors when they visit
          the website. Information collected may include IP address, browser type,
          Internet Service Provider, date and time, referring and exit pages, and number
          of clicks. This information is used for analytics, site administration and
          understanding usage trends, and is not linked to personally identifiable
          information.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and Local Storage">
        <p>
          We use cookies and browser storage to keep you signed in, remember preferences
          and improve the website experience. You can clear or disable cookies and local
          storage through your browser settings, though some features — such as staying
          signed in or keeping your watchlist — may stop working.
        </p>
      </LegalSection>

      <LegalSection title="Third-Party Streaming Providers">
        <p>
          Reelhouse is a discovery and indexing service. Video playback is provided by
          independent third-party players and sources. When you open a player, that
          provider may receive technical information such as your IP address and may use
          its own cookies or tracking technologies. We do not control those providers,
          and their privacy practices are governed by their own policies.
        </p>
      </LegalSection>

      <LegalSection title="Third-Party Advertising">
        <p>
          Some third-party advertisers may use cookies, JavaScript or web beacons in
          advertisements shown on or around the website. These technologies may receive
          your IP address and are used to measure advertising effectiveness and
          personalize advertising content. Reelhouse does not control cookies used by
          third-party advertisers.
        </p>
      </LegalSection>

      <LegalSection title="Third-Party Privacy Policies">
        <p>
          This Privacy Policy does not apply to other websites, players or advertisers. We
          recommend reviewing the privacy policies of third-party services for more
          information about their data practices and how to opt out of certain options.
        </p>
      </LegalSection>

      <LegalSection title="Data Protection Rights">
        <p>
          Depending on your location, you may have rights regarding your personal data,
          including the right to access, correct, delete, restrict, object to processing,
          and request transfer of your data. If you submit a request regarding your data,
          we will respond within a reasonable timeframe.
        </p>
      </LegalSection>

      <LegalSection title="Data Retention and Security">
        <p>
          We keep account information for as long as your account remains active or as
          needed to provide the service and meet legal obligations. We use reasonable
          technical and organizational measures to protect information, but no method of
          transmission or storage is completely secure.
        </p>
      </LegalSection>

      <LegalSection title="Children's Information">
        <p>
          We take children&apos;s privacy seriously. Reelhouse does not knowingly collect
          personal information from children under the age of 13. If you believe that a
          child has provided personal information on our website, please contact us and we
          will remove the information promptly.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          If you have any questions about this Privacy Policy, you can contact us at{" "}
          <GmailLink subject="Reelhouse privacy inquiry" className={LINK}>
            {CONTACT_EMAIL}
          </GmailLink>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
