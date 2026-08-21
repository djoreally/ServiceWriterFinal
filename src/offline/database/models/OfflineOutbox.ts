import { Model } from '@nozbe/watermelondb';

export class OfflineOutbox extends Model {
  static table = 'offline_outbox';
}
