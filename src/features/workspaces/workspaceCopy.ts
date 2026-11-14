export const workspaceCopyOptions = [
  { key: 'accounts', label: 'Accounts', description: 'Company names, industries and locations.' },
  { key: 'contacts', label: 'Contacts', description: 'Names and contact details for the selected accounts.' },
  { key: 'catalog', label: 'Products & Brands', description: 'Product names, brands and categories.' },
  { key: 'templates', label: 'Reporting templates', description: 'Report and dashboard layouts.' },
] as const;

export type CopyCategory = typeof workspaceCopyOptions[number]['key'];
export type Workspace = {
  id: string;
  name: string;
  accounts: { id: string; name: string; industry: string; location: string }[];
  contacts: { id: string; accountId: string; name: string; role: string; email: string }[];
  catalog: { id: string; name: string; brand: string; category: string }[];
  templates: { id: string; name: string; layout: string }[];
  activities: { id: string; summary: string }[];
  opportunities: { id: string; name: string }[];
  orders: { id: string; name: string }[];
  quotes: { id: string; name: string }[];
  salesActual: number;
};

export function normalizeCopySelection(categories: readonly CopyCategory[]) {
  const selected = new Set(categories);
  if (selected.has('contacts')) selected.add('accounts');
  return workspaceCopyOptions.map(option => option.key).filter(key => selected.has(key));
}

export function createWorkspaceCopy({ id, name, source, categories }: {
  id: string;
  name: string;
  source: Workspace;
  categories: readonly CopyCategory[];
}): Workspace {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80) throw new Error('Enter a workspace name between 1 and 80 characters.');
  if (id === source.id) throw new Error('Choose a different workspace identity.');
  const selected = normalizeCopySelection(categories);
  const accountIds = new Map<string, string>();
  const accounts = selected.includes('accounts') ? source.accounts.map(account => {
    const accountId = `${id}:account:${accountIds.size + 1}`;
    accountIds.set(account.id, accountId);
    return { id: accountId, name: account.name, industry: account.industry, location: account.location };
  }) : [];
  const contacts = selected.includes('contacts') ? source.contacts.flatMap((contact, index) => {
    const accountId = accountIds.get(contact.accountId);
    return accountId ? [{ id: `${id}:contact:${index + 1}`, accountId, name: contact.name, role: contact.role, email: contact.email }] : [];
  }) : [];
  return {
    id, name: cleanName, accounts, contacts,
    catalog: selected.includes('catalog') ? source.catalog.map(({ name, brand, category }, index) => ({ id: `${id}:product:${index + 1}`, name, brand, category })) : [],
    templates: selected.includes('templates') ? source.templates.map(({ name, layout }, index) => ({ id: `${id}:template:${index + 1}`, name, layout })) : [],
    activities: [], opportunities: [], orders: [], quotes: [], salesActual: 0,
  };
}
