/**
 * In-app legal documents.
 *
 * The hosted pages (`landing/privacy.html`, `landing/terms.html`) remain the
 * canonical versions for stores and the web; these are the offline copies the
 * app shows when the user taps "Terms of Service" / "Privacy Policy".
 */
export type LegalDocId = 'terms' | 'privacy';
export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocument {
  id: LegalDocId;
  title: string;
  updated: string;
  url: string;
  summary: string;
  sections: LegalSection[];
}

export const LEGAL_BASE_URL = 'https://mess.cvr.name';

const CONTACT_EMAIL = 'top.seo.one@gmail.com';

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = {
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    updated: 'November 16, 2026',
    url: `${LEGAL_BASE_URL}/terms.html`,
    summary:
      'Nova is a free, end-to-end encrypted peer-to-peer messenger. You hold your own keys. Public channels may show clearly labelled first-party ads; private chats are never scanned or advertised in.',
    sections: [
      {
        heading: '1. What the service is',
        paragraphs: [
          'Mess&Anger ("Nova") is a messaging application that encrypts content on your device and delivers it directly between participants, optionally through a thin relay that only stores opaque encrypted envelopes for a short time.',
          'There is no account, no phone number, no email address, and no contact upload. Your identity is a cryptographic keypair generated on your device and represented by a 12- or 24-word recovery phrase.',
          'Public channels are the only surface where Nova may show advertising or apply content moderation at scale. End-to-end encrypted chats are not scanned, profiled or monetised.',
        ],
      },
      {
        heading: '2. Your keys and your responsibility',
        paragraphs: [
          'Only you can decrypt your messages. If you lose your recovery phrase and have no encrypted backup, the data cannot be recovered by us or by anyone else.',
          'You are responsible for keeping your device, recovery phrase, and backups safe, and for the content you send or publish.',
        ],
      },
      {
        heading: '3. Acceptable use',
        paragraphs: ['You agree not to use the app or public channels to:'],
        bullets: [
          'publish or distribute child sexual abuse material, or sexual content involving minors;',
          'promote violence, violent extremism, terrorism, or credible threats of harm;',
          'sell or facilitate illegal drugs, controlled substances, weapons, stolen data, forged documents, or other illegal goods and services;',
          'publish non-consensual intimate imagery, stalk, dox, or expose another person’s private data;',
          'harass, threaten, defraud, impersonate another person, brand, channel or moderator, or run scam and spam campaigns;',
          'distribute malware, phishing links, credential-stealing pages, or attack the relay and other participants’ devices;',
          'infringe copyright or other rights, or evade a sanction by creating a new identity to continue the same violation.',
        ],
      },
      {
        heading: '4. Moderation, reports and sanctions',
        paragraphs: [
          'Reports can target a public post, comment, channel or ad. A report includes the target identifier, a reason, an optional note and a case id. Do not include passwords, recovery phrases or private chats in a report.',
          'Because Nova has no accounts, a sanction applies to the pseudonymous fingerprint derived from an identity key. A sanction may remove content, limit distribution, throttle traffic or pause relay delivery for that fingerprint. It does not give Nova access to your keys, local history or encrypted messages.',
          'We use human review for sanctions that restrict access. Automated action is reserved for clear, high-confidence cases; urgent reports are prioritised. Sanctions have a stated level, reason code and duration.',
          'You can appeal a sanction once from the in-app moderation screen, without an email address. A temporary sanction can be appealed while it is active; the appeal window is 90 days from issue. The response is delivered in the app. Filing an appeal does not pause the sanction.',
          'Creating a new identity does not erase a sanction on the old fingerprint, and using a new identity to continue the same violation is itself a violation. In a peer-to-peer network no operator can guarantee that every banned device is permanently unreachable; we use layered limits rather than promise an absolute block.',
        ],
      },
      {
        heading: '5. Channels and advertising',
        paragraphs: [
          'Public channels may include a limited number of native sponsored cards between posts. Ads are labelled, never cover photos or videos, never autoplay sound, and can be hidden or reported. Ads are not shown in end-to-end encrypted chats or private conversations.',
          'Advertising is contextual: it may use the channel topic and language, but not message content, contact lists, private profile data, cross-site tracking or advertising identifiers. Channel owners and advertisers receive aggregated statistics only, subject to minimum group sizes and delay.',
          'Advertisers are pseudonymous. Nova does not run KYC, request passports, legal-entity documents, phone numbers or email addresses from advertisers. An advertiser is identified by an `advertiser_id` with a prepaid balance; creatives and destination domains are reviewed before delivery. Channel payouts go to a pseudonymous channel wallet after a holdback. Taxes and any duties are the recipient’s responsibility.',
          'Channel owners are responsible for the content they publish and for configuring ad density and blocked categories. Nova may pause a campaign, reject a creative, remove a channel from advertising or block an `advertiser_id` and its domains for violations. Prepaid funds for invalid traffic or undelivered impressions are returned to the ad balance.',
        ],
      },
      {
        heading: '6. Premium subscription',
        paragraphs: [
          'Premium is an optional paid tier billed at USD 3.90 per 30 days. Payment is processed by PaymentO; we never see your card details. Premium removes sponsored cards from public channels.',
          'After a verified payment the relay issues a signed licence key (MA1.<payload>.<signature>) bound to your device identifier. The key unlocks premium features for 30 days and can be re-activated on the same device.',
          'Because the key is bound to a device, a licence cannot be transferred to another device unless the app provides a transfer flow. Contact support if a payment succeeded but no key was issued.',
        ],
      },
      {
        heading: '7. No warranty',
        paragraphs: [
          'The app is provided "as is" and "as available", without warranties of any kind, express or implied, including fitness for a particular purpose and uninterrupted or error-free operation.',
          'Delivery depends on both devices being reachable, directly or through the relay, and on your network. We do not guarantee message delivery, ad availability or moderation response times.',
        ],
      },
      {
        heading: '8. Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages, or for loss of data, messages, keys, ad revenue or channel income. Where liability cannot be excluded, it is limited to the amount you paid in the last 30 days (or USD 3.90 if you used the free tier).',
        ],
      },
      {
        heading: '9. Changes and termination',
        paragraphs: [
          'We may update these terms as the app changes; the current version is always shown in Settings and at the hosted URL above. Continuing to use the app after a change means you accept the updated terms.',
          'You can stop using the service at any time and delete local data from Settings; generating a new identity permanently disconnects the old one. Deleting local data does not lift an active sanction on the old fingerprint.',
        ],
      },
      {
        heading: '10. Contact',
        paragraphs: [`Questions about these terms: ${CONTACT_EMAIL}.`],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    updated: 'November 16, 2026',
    url: `${LEGAL_BASE_URL}/privacy.html`,
    summary:
      'We collect no name, email, phone number, contact list or message content. Moderation uses pseudonymous reports; ads in public channels use contextual placement and aggregate statistics, never an advertising profile.',
    sections: [
      {
        heading: '1. Data we do not collect',
        paragraphs: ['The app is built so that this data never reaches us:'],
        bullets: [
          'message text, attachments, media, polls, locations and call content;',
          'your name, email address, phone number or contacts;',
          'advertising identifiers, cross-site tracking pixels, behavioural ad profiles or third-party analytics;',
          'passport, legal-entity, tax or banking documents from users, channel owners or advertisers.',
        ],
      },
      {
        heading: '2. What the relay can see',
        paragraphs: [
          'When your device uses the relay, it sees the minimum needed to move an envelope: your device public key as the destination, the opaque encrypted payload, the time, and connection metadata such as IP address and user agent.',
          'Relayed envelopes are deleted after delivery or after 7 days, whichever comes first, and the relay cannot decrypt them.',
        ],
      },
      {
        heading: '3. Reports, moderation and sanctions',
        paragraphs: [
          'A report contains the target identifier (a post, comment, channel or campaign), a reason code, an optional note and a case id. The note is encrypted to the moderation key when it leaves the device. We do not ask for your name, email or phone to file or appeal a report.',
          'To limit spam, the moderation service may attach a rotating reporter token that is not linked to your identity, IP address or contacts. Moderators see the reported content, the case history and the reason, not your encrypted chats.',
          'A sanction is recorded against the pseudonymous fingerprint of the reported identity, with a rule id, level, reason, issue time and expiry. Ban-list entries are signed and distributed to relays and clients. Reports and appeal records are kept for up to 12 months after the case closes, then deleted or aggregated.',
        ],
      },
      {
        heading: '4. Advertising',
        paragraphs: [
          'Ads appear only in public channels, between posts. Placement uses the channel topic, language and coarse country, not your messages, contacts, precise location or behaviour across other apps.',
          'Impressions and clicks are counted with short-lived blinded tokens and local aggregation. We do not store an advertising ID, device ID, IP address or user key with an ad event. Channel owners and advertisers receive aggregate counts, revenue and fill rate only, with a minimum group size of 100 and a 24-hour delay.',
          'Your hidden-ad and blocked-advertiser lists stay on your device. They are not sent to the advertiser. A report about an ad is handled like any other moderation report and never reveals your identity to the advertiser.',
          'Advertisers are pseudonymous and prepaid; we do not collect their identity documents. A payment provider may have its own legal obligations to the payer, but Nova does not receive or store KYC data.',
        ],
      },
      {
        heading: '5. What stays on your device',
        paragraphs: [
          'Your recovery phrase, keypair, chat history, contacts, settings, sticker packs, premium licence, local moderation outbox and ad preferences are stored locally, encrypted with a key derived on your device.',
          'Exports and cloud backups are encrypted with a passphrase you choose before they leave the device; the passphrase is never transmitted.',
        ],
      },
      {
        heading: '6. Payments',
        paragraphs: [
          'Premium purchases are handled by PaymentO. We store a receipt without personal data: order id, amount, currency, status, timestamp and the device identifier the licence is bound to. Card data is processed only by PaymentO.',
          'Ad credits and channel payouts use prepaid codes, crypto invoices or a payment link. We store campaign id, amount, currency, status and a pseudonymous wallet reference. We do not store a legal name, address, tax id or bank account for advertisers.',
        ],
      },
      {
        heading: '7. Optional network features',
        paragraphs: [
          'Map tiles are requested from OpenStreetMap only while the mesh map is open and you are online. If you enable an encrypted cloud backup, your device uploads the encrypted blob to the WebDAV or S3 endpoint that you configure.',
        ],
      },
      {
        heading: '8. Your choices',
        paragraphs: [
          'You can run the app with zero network requests for messaging, hide ads, block advertisers, delete local moderation data, and permanently abandon an identity by generating a new one. Premium removes ads.',
          'You can appeal a sanction once in the app and request information about the case id without providing an email address. Requests about relay metadata can be sent to the contact address below.',
        ],
      },
      {
        heading: '9. Children',
        paragraphs: ['The service is not directed to children under 13.'],
      },
      {
        heading: '10. Contact',
        paragraphs: [`Privacy questions and data requests: ${CONTACT_EMAIL}.`],
      },
    ],
  },
};

export function getLegalDocument(id: LegalDocId): LegalDocument {
  return LEGAL_DOCUMENTS[id];
}
