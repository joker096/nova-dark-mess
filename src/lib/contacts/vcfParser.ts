/**
 * vCard (VCF) parser for contact import.
 * Supports vCard 3.0 and 4.0 formats.
 */

export interface ParsedContact {
  name: string;
  nickname?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  note?: string;
}

export interface VCFParseResult {
  contacts: ParsedContact[];
  errors: string[];
}

/**
 * Parse a vCard string into contact objects.
 */
export function parseVCF(vcfString: string): VCFParseResult {
  const contacts: ParsedContact[] = [];
  const errors: string[] = [];

  const trimmed = vcfString.trim();
  if (!trimmed) {
    errors.push('No valid vCard found in file');
    return { contacts, errors };
  }

  // Split by BEGIN:VCARD / END:VCARD
  const vcardRegex = /BEGIN:VCARD([\s\S]*?)END:VCARD/gi;
  let match;

  while ((match = vcardRegex.exec(vcfString)) !== null) {
    const vcardContent = match[1];
    try {
      const contact = parseSingleVCF(vcardContent);
      if (contact) {
        contacts.push(contact);
      }
    } catch (err) {
      errors.push(`Failed to parse vCard: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (contacts.length === 0) {
    // Try parsing as a single vCard without BEGIN/END markers
    try {
      const contact = parseSingleVCF(vcfString);
      if (contact) contacts.push(contact);
    } catch {
      errors.push('No valid vCard found in file');
    }
  }

  return { contacts, errors };
}

function parseSingleVCF(content: string): ParsedContact | null {
  const lines = unfoldLines(content.trim().split(/\r?\n/));
  const contact: Partial<ParsedContact> = {};
  const phones: string[] = [];
  const emails: string[] = [];

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const [propertyPart, value] = [line.slice(0, colonIndex), line.slice(colonIndex + 1)];
    const [propertyName] = propertyPart.split(';');
    const upperProperty = propertyName.toUpperCase();

    switch (upperProperty) {
      case 'FN':
      case 'N':
        if (!contact.name) contact.name = decodeValue(value, propertyPart);
        break;
      case 'NICKNAME':
        contact.nickname = value.trim();
        break;
      case 'TEL':
        phones.push(cleanPhoneNumber(value));
        break;
      case 'EMAIL':
        emails.push(value.trim().toLowerCase());
        break;
      case 'PHOTO':
      case 'LOGO':
        // Handle base64 encoded images
        if (value.startsWith('data:')) {
          contact.avatar = value;
        } else if (value.match(/^[A-Za-z0-9+/=]+$/)) {
          contact.avatar = `data:image/jpeg;base64,${value}`;
        }
        break;
      case 'NOTE':
        contact.note = decodeValue(value, propertyPart);
        break;
      case 'UID':
      case 'ORG':
      case 'TITLE':
      case 'ADR':
      case 'BDAY':
      case 'URL':
        // Ignored for now
        break;
      default:
        // Unknown property, ignore
        break;
    }
  }

  // Use first phone and email
  if (phones.length > 0) contact.phone = phones[0];
  if (emails.length > 0) contact.email = emails[0];

  // Require at least a name or phone
  if (!contact.name && !contact.phone) return null;

  // Generate nickname from name if not provided
  if (!contact.nickname && contact.name) {
    contact.nickname = generateNickname(contact.name);
  }

  return contact as ParsedContact;
}

/**
 * Unfold lines that are continued with whitespace (per RFC 6350).
 */
function unfoldLines(lines: string[]): string[] {
  const unfolded: string[] = [];
  let current = '';

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      current += ' ' + line.slice(1).trimStart();
    } else {
      if (current) unfolded.push(current);
      current = line;
    }
  }
  if (current) unfolded.push(current);

  return unfolded;
}

/**
 * Decode vCard value (handle quoted-printable, charset, etc.)
 */
function decodeValue(value: string, propertyPart: string): string {
  let decoded = value;

  // Handle CHARSET parameter
  const charsetMatch = propertyPart.match(/CHARSET=([^;:]+)/i);
  if (charsetMatch) {
    const charset = charsetMatch[1].toUpperCase();
    // For simplicity, assume UTF-8
  }

  // Handle ENCODING parameter (quoted-printable)
  const encodingMatch = propertyPart.match(/ENCODING=([^;:]+)/i);
  if (encodingMatch && encodingMatch[1].toUpperCase() === 'QUOTED-PRINTABLE') {
    decoded = decodeQuotedPrintable(value);
  }

  // Decode escaped characters per RFC 6350
  decoded = decoded
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\:/g, ':')
    .replace(/\\\\/g, '\\');

  return decoded.trim();
}

/**
 * Decode quoted-printable encoding.
 */
function decodeQuotedPrintable(str: string): string {
  return str.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Clean and normalize phone number.
 */
function cleanPhoneNumber(phone: string): string {
  // Remove all non-digit characters except + at start
  let cleaned = phone.replace(/[^\d+]/g, '');
  // Ensure + prefix for international numbers
  if (cleaned.length > 10 && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

/**
 * Generate a nickname from a full name.
 */
function generateNickname(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Match imported contacts with existing MOCK_CHATS by phone or name.
 */
export function matchContactsWithChats(
  imported: ParsedContact[],
  existingChats: Array<{ id: string; name: string; phone?: string; nickname?: string }>
): Array<{ imported: ParsedContact; matchedChatId?: string; matchType: 'phone' | 'name' | 'none' }> {
  return imported.map((contact) => {
    // Try phone match first
    if (contact.phone) {
      const phoneMatch = existingChats.find((chat) =>
        chat.phone && normalizePhone(chat.phone) === normalizePhone(contact.phone!)
      );
      if (phoneMatch) return { imported: contact, matchedChatId: phoneMatch.id, matchType: 'phone' };
    }

    // Try name match
    if (contact.name) {
      const nameMatch = existingChats.find((chat) =>
        chat.name.toLowerCase() === contact.name!.toLowerCase() ||
        chat.nickname?.toLowerCase() === contact.name!.toLowerCase()
      );
      if (nameMatch) return { imported: contact, matchedChatId: nameMatch.id, matchType: 'name' };
    }

    return { imported: contact, matchType: 'none' };
  });
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}