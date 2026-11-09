import type { PublicRoomsResponse } from '@almost-you/shared';
import { apiFetch } from './api';

export function fetchPublicRooms(): Promise<PublicRoomsResponse> {
  return apiFetch<PublicRoomsResponse>('/rooms');
}
