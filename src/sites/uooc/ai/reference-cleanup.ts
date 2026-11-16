import { scoped } from '../../../common/core/log.ts';
import {
  aiProfiles, aiProfileSecret, deferReferenceCleanup, expiredReferenceFiles, removeReferenceFileBindings,
} from '../settings.ts';
import { isDeepSeekEndpoint } from './deepseek.ts';
import { deleteDeepSeekFile } from './deepseek-tools.ts';

const log = scoped('uooc/reference-cleanup');
let cleaning = false;

export async function cleanExpiredReferences(): Promise<void> {
  if (cleaning) return;
  cleaning = true;
  try {
    const files = expiredReferenceFiles();
    if (files.length === 0) return;
    const keys = new Map(aiProfiles().filter((profile) => isDeepSeekEndpoint(profile.baseUrl))
      .map((profile) => [profile.id, aiProfileSecret(profile.id, profile.baseUrl)]));
    for (const file of files) {
      const preferred = file.profileId === undefined ? undefined : keys.get(file.profileId);
      const candidates = new Set([preferred, ...keys.values()].filter((key): key is string => Boolean(key)));
      if (candidates.size === 0) continue;
      let deleted = false;
      for (const key of candidates) {
        try {
          await deleteDeepSeekFile(file.id, key);
          deleted = true;
          break;
        } catch {
          // Another configured DeepSeek profile may own this file.
        }
      }
      if (deleted) removeReferenceFileBindings(file.id);
      else {
        deferReferenceCleanup(file.id);
        log.warn('有到期文件未能从 DeepSeek 清理，稍后重试');
      }
    }
  } catch {
    log.warn('无法读取或清理到期课程资料');
  } finally {
    cleaning = false;
  }
}
