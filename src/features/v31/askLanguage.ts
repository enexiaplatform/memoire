import { normalizeSearchText } from '../../utils/textSearch.ts';

/** Interpret supported intents only; retain the original entity names. */
export function interpretAskQuestion(question: string): string {
  const text = normalizeSearchText(question);
  const intents: [RegExp, string][] = [
    [/tien.*(o dau|mac ket|dang cho)|cong no|khoan.*phai thu|khach.*(con no|no tien|chua tra|chua thanh toan)/, 'Where is the money?'],
    [/toi.*(no|phai tra)|nghia vu.*toi/, 'What do I owe?'],
    [/dang cho.*(khach|nguoi mua)|khach.*no.*toi/, 'What am I waiting on customers for?'],
    [/cam ket|loi hua/, 'Did I keep my promises?'],
    [/ty le thang|du bao.*(dung|chinh xac)/, 'How often do I win?'],
    [/tuan.*(vua|truoc|nay).*(xay ra|ket qua|tong ket)|tong ket.*tuan/, 'What happened this week?'],
    [/thay doi|co gi moi/, 'What changed?'],
    [/khach.*(im lang|can.*lien he)|can.*cham soc/, 'Which accounts need follow-up?'],
    [/tinh trang|dang the nao|tien trien|den dau|dung o dau|tong quan/, 'Where do we stand?'],
    [/lam gi.*(tiep|hom nay)|viec.*uu tien/, 'What should I fix today?'],
  ];
  const matched = intents.find(([pattern]) => pattern.test(text));
  return matched ? `${matched[1]} ${question}` : question;
}
