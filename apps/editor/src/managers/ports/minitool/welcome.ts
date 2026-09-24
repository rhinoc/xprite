export interface MiniToolWelcomePort {
  readDismissed(): Promise<boolean>;
  rememberDismissed(): Promise<void>;
}
