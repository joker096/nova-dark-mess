import { describe, it, expect } from 'vitest';
import { parseVCF, matchContactsWithChats, ParsedContact } from './vcfParser';

describe('VCF Parser', () => {
  const sampleVCF3 = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
TEL;TYPE=CELL:+1-555-123-4567
EMAIL:john.doe@example.com
NICKNAME:JD
NOTE:Friend from college
END:VCARD`;

  const sampleVCF4 = `BEGIN:VCARD
VERSION:4.0
FN:Jane Smith
N:Smith;Jane;;;
TEL;TYPE=HOME,VOICE:+44 20 7946 0958
EMAIL:jane.smith@company.co.uk
ORG:Acme Corp
TITLE:Engineer
END:VCARD`;

  const sampleMultiVCF = `BEGIN:VCARD
VERSION:3.0
FN:Alice Johnson
TEL:+1-555-000-1111
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Bob Wilson
TEL:+1-555-000-2222
EMAIL:bob@test.com
END:VCARD`;

  const vcfWithFolding = `BEGIN:VCARD
VERSION:3.0
FN:Long Name That Gets
 Folded Across Multiple
 Lines
TEL:+1-555-999-8888
END:VCARD`;

  it('parses vCard 3.0 with basic fields', () => {
    const result = parseVCF(sampleVCF3);
    expect(result.contacts).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    const contact = result.contacts[0];
    expect(contact.name).toBe('John Doe');
    expect(contact.phone).toBe('+15551234567');
    expect(contact.email).toBe('john.doe@example.com');
    expect(contact.nickname).toBe('JD');
    expect(contact.note).toBe('Friend from college');
  });

  it('parses vCard 4.0', () => {
    const result = parseVCF(sampleVCF4);
    expect(result.contacts).toHaveLength(1);
    const contact = result.contacts[0];
    expect(contact.name).toBe('Jane Smith');
    expect(contact.phone).toBe('+442079460958');
    expect(contact.email).toBe('jane.smith@company.co.uk');
  });

  it('parses multiple vCards in one file', () => {
    const result = parseVCF(sampleMultiVCF);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].name).toBe('Alice Johnson');
    expect(result.contacts[1].name).toBe('Bob Wilson');
  });

  it('handles line folding', () => {
    const result = parseVCF(vcfWithFolding);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].name).toBe('Long Name That Gets Folded Across Multiple Lines');
  });

  it('generates nickname from name when not provided', () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Mary Jane Watson
TEL:+1-555-777-6666
END:VCARD`;
    const result = parseVCF(vcf);
    expect(result.contacts[0].nickname).toBe('MW');
  });

  it('handles missing fields gracefully', () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Minimal Contact
END:VCARD`;
    const result = parseVCF(vcf);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].name).toBe('Minimal Contact');
    expect(result.contacts[0].phone).toBeUndefined();
    expect(result.contacts[0].email).toBeUndefined();
  });

  it('returns error for empty/invalid input', () => {
    const result = parseVCF('');
    expect(result.contacts).toHaveLength(0);
    expect(result.errors).toContain('No valid vCard found in file');
  });

  it('cleans phone numbers correctly', () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Test User
TEL:+1 (555) 123-4567
END:VCARD`;
    const result = parseVCF(vcf);
    expect(result.contacts[0].phone).toBe('+15551234567');
  });
});

describe('Contact Matching', () => {
  const existingChats = [
    { id: 'katie', name: 'Katie Rogers', phone: '+1-555-123-4567', nickname: '@katie' },
    { id: 'kurt', name: 'Kurt Williamson', phone: '+44-20-7946-0958', nickname: '@kurt' },
    { id: 'stacy', name: 'Stacy Roberts', nickname: '@stacy' },
  ];

  const importedContacts: ParsedContact[] = [
    { name: 'Katie Rogers', phone: '+15551234567', nickname: 'KR' },
    { name: 'Kurt Williamson', phone: '+442079460958', nickname: 'KW' },
    { name: 'New Person', phone: '+1-555-000-0000', nickname: 'NP' },
    { name: 'Stacy Roberts', nickname: 'SR' },
  ];

  it('matches contacts by phone number', () => {
    const matches = matchContactsWithChats(importedContacts, existingChats);
    expect(matches[0].matchType).toBe('phone');
    expect(matches[0].matchedChatId).toBe('katie');
    expect(matches[1].matchType).toBe('phone');
    expect(matches[1].matchedChatId).toBe('kurt');
  });

  it('matches contacts by name when phone not available', () => {
    const matches = matchContactsWithChats(importedContacts, existingChats);
    expect(matches[3].matchType).toBe('name');
    expect(matches[3].matchedChatId).toBe('stacy');
  });

  it('returns none for unknown contacts', () => {
    const matches = matchContactsWithChats(importedContacts, existingChats);
    expect(matches[2].matchType).toBe('none');
    expect(matches[2].matchedChatId).toBeUndefined();
  });
});