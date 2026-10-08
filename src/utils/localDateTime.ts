import { isValidBusinessDate } from './safeDate.ts';

/** datetime-local displays wall time; stored timestamps identify an instant. */
export function instantToLocalInput(instant:string):string{
 const date=new Date(instant);if(!instant||!Number.isFinite(date.getTime()))return '';
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function localInputToInstant(value:string):string{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||!isValidBusinessDate(value.slice(0,10)))return '';
 const date=new Date(value);
 // Reject rollover and nonexistent local times, including a DST gap.
 return Number.isFinite(date.getTime())&&instantToLocalInput(date.toISOString())===value?date.toISOString():'';
}
