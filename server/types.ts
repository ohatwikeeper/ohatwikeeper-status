export type Status = 'operational' | 'degraded' | 'outage'
export interface Service {
  id: string; name: string; nameJa: string; publicUrl: string; url: string
  affectsJa?: string[]; method?: 'HEAD' | 'GET'; pageSlug?: string; parentId?: string; requiresAuth?: boolean; category?: 'system' | 'page' | 'api'; okCodes?: number[]; extraUrls?: string[]
}
export const rank: Record<Status, number> = { operational: 0, degraded: 1, outage: 2 }

/** 障害時のチェック詳細(公開しても安全な事実のみ。本文・Cookie・内部ホストは含めない) */
export interface Detail { kind: 'timeout' | 'dns' | 'refused' | 'reset' | 'tls' | 'network' | 'http' | 'login' | 'body' | 'slow'; target: string; cause?: string; location?: string; server?: string; ray?: string; ctype?: string; retry?: string }
