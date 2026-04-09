import type {
  BackgroundMessageType,
  BackgroundRequestMap,
  BackgroundResponseMap,
} from "../../shared/types/messages.js";

export interface BackgroundMessageClient {
  send<TType extends BackgroundMessageType>(
    type: TType,
    payload: BackgroundRequestMap[TType],
  ): Promise<BackgroundResponseMap[TType]>;
}
