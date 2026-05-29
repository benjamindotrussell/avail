import { FirebaseAuthTypes } from '@react-native-firebase/auth';

let _confirmation: FirebaseAuthTypes.PhoneAuthConfirmation | null = null;

export const setConfirmation   = (c: FirebaseAuthTypes.PhoneAuthConfirmation) => { _confirmation = c; };
export const getConfirmation   = (): FirebaseAuthTypes.PhoneAuthConfirmation | null => _confirmation;
export const clearConfirmation = () => { _confirmation = null; };
