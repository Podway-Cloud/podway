import LegalDoc from "@/components/legal-doc";

export const metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <LegalDoc
      title="Cookie Policy"
      updated="August 6, 2026"
      intro="What cookies Podway uses, why, and how to control them."
    >
      <h2>What cookies are</h2>
      <p>
        Cookies are small files a site stores in your browser. Some are needed for the site to work;
        others help us understand how the app is used. We keep our use minimal.
      </p>

      <h2>Strictly-necessary cookies (always on)</h2>
      <p>
        These are required for Podway to function, so they don&rsquo;t need consent:
      </p>
      <ul>
        <li>
          <strong>Session cookie</strong> — keeps you signed in (set by our authentication).
        </li>
        <li>
          <strong>Cookie-choice cookie</strong> (<code>pb-cookie-consent</code>) — remembers whether
          you accepted or declined analytics, so we don&rsquo;t ask again.
        </li>
      </ul>

      <h2>Landing A/B testing (first-party)</h2>
      <p>
        On our landing page we test different versions to see which explains Podway best. This uses
        two first-party cookies — <code>pb_landing_visitor</code> (a random id, so you see a
        consistent version) and <code>pb_landing_..._variant</code> (which version you saw) — and we
        count views and sign-ups <strong>on our own servers</strong>. No third party is involved and
        no data leaves Podway. We treat this as a first-party functional/measurement use under our
        legitimate interest in improving the site; you can opt out by declining analytics below or by
        clearing these cookies.
      </p>
      <p>
        When you arrive through a partner&rsquo;s link (a URL with <code>?ref=</code>), a first-party
        cookie <code>pw_ref</code> remembers that link&rsquo;s name for 30 days, so the partner is credited
        if you sign up. It holds only the link&rsquo;s name, never anything about you, and stays on our
        own servers.
      </p>

      <h2>Analytics cookies (only with your consent)</h2>
      <p>
        With your consent, we use <strong>PostHog</strong> for product analytics — to see which
        features are used and where the app is slow, so we can improve it. Until you accept (or if you
        decline), PostHog only counts page visits in a cookieless mode: it sets <strong>no</strong>{" "}
        cookies and stores nothing on your device, keeps no identifier that recognises you on another
        day, and does not record your session. When you
        accept, it stores analytics identifiers to recognise your browser across sessions.
      </p>
      <p>
        We also use <strong>Google Analytics</strong> to understand traffic and which pages people
        reach. It runs in Google&rsquo;s <em>Consent Mode</em> with storage defaulted to{" "}
        <strong>denied</strong>, so until you accept it sets <strong>no</strong> analytics cookies
        (<code>_ga</code>, <code>_ga_*</code>). When you accept, those cookies are used to measure
        visits and distinguish returning browsers. Declining, or clearing your cookie choice, stops
        them.
      </p>
      <h2>Advertising cookies (Google Ads)</h2>
      <p>
        We run ads on Google. To measure which ads lead to a sign-up, every page loads the{" "}
        <strong>Google Ads</strong> tag, which sets Google&rsquo;s advertising cookies (such as{" "}
        <code>_gcl_au</code>) on every visit, whether or not you accept analytics. When you create an
        account, it records one anonymous &ldquo;sign-up&rdquo; event. You can block these cookies in your
        browser or with Google&rsquo;s ad settings.
      </p>
      <p>
        We deliberately limit what analytics can see: the pod terminal and secret inputs are excluded
        from any session recording, outbound events are scrubbed of credential-shaped values, and the
        fleet&rsquo;s fetch-memory stores only a domain — never a URL, page content, or who asked.
      </p>

      <h2>The support chat</h2>
      <p>
        Our in-app support chat (also PostHog) uses storage to keep your conversation with us. If you
        decline analytics, the support widget still works when you open it, but your ticket may be
        scoped to that browser session.
      </p>

      <h2>Managing your choice</h2>
      <p>
        You choose when the cookie banner appears. To change your mind later, clear the{" "}
        <code>pb-cookie-consent</code> cookie in your browser (or all Podway cookies) and reload —
        the banner will reappear so you can choose again. You can also block or delete cookies in your
        browser settings; strictly-necessary cookies may be needed for sign-in to work.
      </p>

      <h2>More</h2>
      <p>
        See our <a href="/privacy">Privacy Policy</a> for the fuller picture of what we collect and
        why.
      </p>
    </LegalDoc>
  );
}
