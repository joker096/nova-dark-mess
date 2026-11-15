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
    updated: 'November 15, 2026',
    url: `${LEGAL_BASE_URL}/terms.html`,
    summary:
      'Mess&Anger is a free, end-to-end encrypted peer-to-peer messenger. You hold your own keys; we do not run accounts, store your messages, or ask for personal data.',
    sections: [
      {
        heading: '1. What the service is',
        paragraphs: [
          'Mess&Anger ("Nova") is a messaging application that encrypts content on your device and delivers it directly between participants, optionally through a thin relay that only stores opaque encrypted envelopes for a short time.',
          'There is no account, no phone number, no email address, and no contact upload. Your identity is a cryptographic keypair generated on your device and represented by a 12- or 24-word recovery phrase.',
        ],
      },
      {
        heading: '2. Your keys and your responsibility',
        paragraphs: [
          'Only you can decrypt your messages. If you lose your recovery phrase and have no encrypted backup, the data cannot be recovered by us or by anyone else.',
          'You are responsible for keeping your device, recovery phrase, and backups safe, and for the content you send.',
        ],
      },
      {
        heading: '3. Acceptable use',
        paragraphs: ['You agree not to use the app to:'],
        bullets: [
          'send unlawful content, malware, or material that infringes the rights of others;',
          'harass, threaten, or defraud other people;',
          'attack, overload, or probe the relay or other participants\u2019 devices.',
        ],
      },
      {
        heading: '4. Premium subscription',
        paragraphs: [
          'Premium is an optional paid tier billed at USD 3.90 per 30 days. Payment is processed by PaymentO; we never see your card details.',
          'After a verified payment the relay issues a signed licence key (MA1.<payload>.<signature>) bound to your device identifier. The key unlocks premium features for 30 days and can be re-activated on the same device.',
          'Because the key is bound to a device, a licence cannot be transferred to another device unless the app provides a transfer flow. Contact support if a payment succeeded but no key was issued.',
        ],
      },
      {
        heading: '5. No warranty',
        paragraphs: [
          'The app is provided "as is" and "as available", without warranties of any kind, express or implied, including fitness for a particular purpose and uninterrupted or error-free operation.',
          'Delivery depends on both devices being reachable, directly or through the relay, and on your network. We do not guarantee message delivery.',
        ],
      },
      {
        heading: '6. Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages, or for loss of data, messages, or keys. Where liability cannot be excluded, it is limited to the amount you paid in the last 30 days (or USD 3.90 if you used the free tier).',
        ],
      },
      {
        heading: '7. Changes and termination',
        paragraphs: [
          'We may update these terms as the app changes; the current version is always shown in Settings and at the hosted URL above. Continuing to use the app after a change means you accept the updated terms.',
          'You can stop using the service at any time and delete local data from Settings; generating a new identity permanently disconnects the old one.',
        ],
      },
      {
        heading: '8. Contact',
        paragraphs: [`Questions about these terms: ${CONTACT_EMAIL}.`],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    updated: 'November 15, 2026',
    url: `${LEGAL_BASE_URL}/privacy.html`,
    summary:
      'We collect no personal data: no name, no email, no phone number, no contact list, no message content. Your keys and history stay on your device.',
    sections: [
      {
        heading: '1. Data we do not collect',
        paragraphs: ['The app is built so that this data never reaches us:'],
        bullets: [
          'message text, attachments, media, polls, locations and call content;',
          'your name, email address, phone number or contacts;',
          'advertising identifiers, tracking pixels or third-party analytics.',
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
        heading: '3. What stays on your device',
        paragraphs: [
          'Your recovery phrase, keypair, chat history, contacts, settings, sticker packs and premium licence are stored locally, encrypted with a key derived on your device.',
          'Exports and cloud backups are encrypted with a passphrase you choose before they leave the device; the passphrase is never transmitted.',
        ],
      },
      {
        heading: '4. Payments',
        paragraphs: [
          'Premium purchases are handled by PaymentO. We store a receipt without personal data: order id, amount, currency, status, timestamp and the device identifier the licence is bound to. Card data is processed only by PaymentO.',
        ],
      },
      {
        heading: '5. Optional network features',
        paragraphs: [
          'Map tiles are requested from OpenStreetMap only while the mesh map is open and you are online. If you enable an encrypted cloud backup, your device uploads the encrypted blob to the WebDAV or S3 endpoint that you configure.',
        ],
      },
      {
        heading: '6. Your choices',
        paragraphs: [
          'You can run the app with zero network requests for messaging, delete local data from Settings, and permanently abandon an identity by generating a new one. Requests about relay metadata can be sent to the contact address below.',
        ],
      },
      {
        heading: '7. Children',
        paragraphs: ['The service is not directed to children under 13.'],
      },
      {
        heading: '8. Contact',
        paragraphs: [`Privacy questions and data requests: ${CONTACT_EMAIL}.`],
      },
    ],
  },
};

export function getLegalDocument(id: LegalDocId): LegalDocument {
  return LEGAL_DOCUMENTS[id];
}
