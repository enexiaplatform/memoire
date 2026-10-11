import type { LeadSource } from '../../utils/leadQueue';

/**
 * The Add lead form's shape, kept out of the drawer component so that file
 * exports components only and fast refresh keeps working on it.
 */
export type NewLeadInput = {
  accountName: string;
  brand: string;
  brandCatalogId?: string;
  opportunityName: string;
  contactName: string;
  contactRole: string;
  leadSource: LeadSource | '';
  leadSourceDetail: string;
  nextAction: string;
  nextActionDate: string;
};

export const emptyNewLead: NewLeadInput = {
  accountName: '',
  brand: '',
  opportunityName: '',
  contactName: '',
  contactRole: '',
  leadSource: '',
  leadSourceDetail: '',
  nextAction: '',
  nextActionDate: '',
};
