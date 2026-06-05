import type { ElementType } from 'react';
import {
  Type, AlignLeft, Hash, List, Tags, Calendar, User, CheckSquare, Star,
  Banknote, Percent, Link2, AtSign, Phone, Paperclip, KeyRound, Link, Lock,
} from 'lucide-react';
import type { FieldType } from '../lib/types';

/** Canonical icon per field type. Typed as a full Record so tsc forces every
 *  field type to have an icon — add a type, the compiler makes you add it here. */
export const TYPE_ICONS: Record<FieldType, ElementType> = {
  text: Type, longText: AlignLeft, number: Hash, singleSelect: List,
  multiSelect: Tags, date: Calendar, person: User, checkbox: CheckSquare,
  currency: Banknote, percent: Percent, rating: Star,
  url: Link2, email: AtSign, phone: Phone, file: Paperclip, totp: KeyRound, link: Link, password: Lock,
};
