import type { ReactNode } from 'react';
import {
  Building2,
  Boxes,
  CircleQuestionMark,
  Globe,
  Lightbulb,
  Package,
  ShieldAlert,
  Swords,
  Target,
  UserRound,
} from 'lucide-react';
import type { KnowledgeNodeType } from '../../utils/knowledgeGraph';

/**
 * What each kind of knowledge looks like.
 *
 * One place, because the same node appears in four contexts - a graph node, a
 * library row, a drawer header, a search result - and a customer that is blue
 * on the map and grey in the list is two things to the reader.
 *
 * The palette is deliberately narrow. Ten node types could be ten hues, and
 * that produces a rainbow nobody can decode; instead the three types an
 * operator spends their day on carry the product's own accents (customer blue,
 * person green, deal navy) and the rest sit quietly around them. Colour never
 * carries meaning alone - every node also has an icon and a written type label.
 */

export type NodeVisual = {
  /** For SVG strokes and fills, where a Tailwind class cannot reach. */
  accent: string;
  /** A very light wash for the node body. */
  wash: string;
  /** Tailwind classes for the type chip in HTML contexts. */
  chip: string;
  icon: (className?: string) => ReactNode;
};

const VISUALS: Record<KnowledgeNodeType, NodeVisual> = {
  account: {
    accent: '#1976D2',
    wash: '#EFF6FF',
    chip: 'bg-blue-50 text-brand-blue ring-1 ring-inset ring-blue-200',
    icon: (className) => <Building2 className={className} />,
  },
  person: {
    accent: '#2F855A',
    wash: '#F0FDF4',
    chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    icon: (className) => <UserRound className={className} />,
  },
  opportunity: {
    accent: '#1B2B3A',
    wash: '#F1F5F9',
    chip: 'bg-slate-100 text-navy ring-1 ring-inset ring-slate-300',
    icon: (className) => <Target className={className} />,
  },
  brand: {
    accent: '#3949AB',
    wash: '#EEF2FF',
    chip: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
    icon: (className) => <Boxes className={className} />,
  },
  product: {
    accent: '#7B1FA2',
    wash: '#FAF5FF',
    chip: 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200',
    icon: (className) => <Package className={className} />,
  },
  industry: {
    accent: '#00838F',
    wash: '#ECFEFF',
    chip: 'bg-cyan-50 text-cyan-800 ring-1 ring-inset ring-cyan-200',
    icon: (className) => <Globe className={className} />,
  },
  competitor: {
    accent: '#B3261E',
    wash: '#FEF2F2',
    chip: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
    icon: (className) => <Swords className={className} />,
  },
  objection: {
    accent: '#B45309',
    wash: '#FFFBEB',
    chip: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
    icon: (className) => <ShieldAlert className={className} />,
  },
  note: {
    accent: '#6D28D9',
    wash: '#F5F3FF',
    chip: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200',
    icon: (className) => <Lightbulb className={className} />,
  },
  question: {
    accent: '#C2410C',
    wash: '#FFF7ED',
    chip: 'bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-200',
    icon: (className) => <CircleQuestionMark className={className} />,
  },
};

export function nodeVisual(type: KnowledgeNodeType): NodeVisual {
  return VISUALS[type] || VISUALS.note;
}

export function nodeIcon(type: KnowledgeNodeType, className = 'h-3.5 w-3.5') {
  return nodeVisual(type).icon(className);
}
