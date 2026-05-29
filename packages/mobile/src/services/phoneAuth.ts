import type { ConfirmationResult } from 'firebase/auth';

let _confirmation: ConfirmationResult | null = null;

export const setConfirmation  = (c: ConfirmationResult) => { _confirmation = c; };
export const getConfirmation  = (): ConfirmationResult | null => _confirmation;
export const clearConfirmation = () => { _confirmation = null; };
