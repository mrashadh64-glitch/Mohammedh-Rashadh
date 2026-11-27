import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { getSpecialProgrammeBySlug } from './firestoreService';
import {
  DEFAULT_BRAND_SETTINGS,
  DEFAULT_FREE_SKILL_PROGRAMME,
  INSTITUTE_INFO,
  SEED_BRANCHES,
  SEED_CMS_ITEMS,
  SEED_COURSES,
} from '../data/catalogSeed';
import {
  Branch,
  BrandSettings,
  CmsItem,
  CommunityPost,
  Course,
  GeneratedPoster,
  SpecialProgramme,
} from '../types/lms';

export interface PublicCatalogPayload {
  courses: Course[];
  branches: Branch[];
  cmsItems: CmsItem[];
  showcasePosts: CommunityPost[];
  specialProgramme: SpecialProgramme;
  publishedPosters: GeneratedPoster[];
  brandSettings: BrandSettings;
  fetchedAt: number;
}

const CACHE_KEY = 'techman_public_catalog_v2';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for public non-PII catalog data

let memoryCache: PublicCatalogPayload | null = null;
let inflightPromise: Promise<PublicCatalogPayload> | null = null;

function readSessionCache(): PublicCatalogPayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicCatalogPayload;
    if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return {
      ...parsed,
      publishedPosters: Array.isArray(parsed.publishedPosters) ? parsed.publishedPosters : [],
      brandSettings: parsed.brandSettings || DEFAULT_BRAND_SETTINGS,
    };
  } catch {
    return null;
  }
}

function writeSessionCache(payload: PublicCatalogPayload): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function getCachedPublicCatalogSync(): PublicCatalogPayload | null {
  if (memoryCache && Date.now() - memoryCache.fetchedAt <= CACHE_TTL_MS) {
    return memoryCache;
  }
  const sessionHit = readSessionCache();
  if (sessionHit) {
    memoryCache = sessionHit;
    return sessionHit;
  }
  return null;
}

export function invalidatePublicCatalogCache(): void {
  memoryCache = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Fetches bounded public-only catalog collections with in-flight deduplication and 5-minute TTL cache.
 * Never caches private student records or authenticated PII.
 * Posters query strictly enforces status == 'published' so unapproved/draft/rejected posters never leak publicly.
 */
export async function fetchPublicCatalogOptimized(forceRefresh = false): Promise<PublicCatalogPayload> {
  if (!forceRefresh) {
    const cached = getCachedPublicCatalogSync();
    if (cached) return cached;
    if (inflightPromise) return inflightPromise;
  }

  inflightPromise = (async () => {
    try {
      const [courseSnap, branchSnap, cmsSnap, projSnap, specialProg, publishedPosterSnap, brandSnap] =
        await Promise.all([
          getDocs(query(collection(db, 'courses'), where('status', '==', 'published'), limit(100))),
          getDocs(query(collection(db, 'branches'), where('status', '==', 'active'), limit(30))),
          getDocs(query(collection(db, 'cmsItems'), where('status', '==', 'published'), limit(60))),
          getDocs(
            query(collection(db, 'communityPosts'), where('moderatedStatus', '==', 'active'), limit(30))
          ),
          getSpecialProgrammeBySlug('free-skill-development'),
          getDocs(
            query(collection(db, 'generatedPosters'), where('status', '==', 'published'), limit(40))
          ).catch(() => null),
          getDoc(doc(db, 'brandSettings', INSTITUTE_INFO.institutionId)).catch(() => null),
        ]);

      const courses: Course[] = !courseSnap.empty
        ? courseSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) }))
        : SEED_COURSES;

      const branches: Branch[] = !branchSnap.empty
        ? branchSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, 'id'>) }))
        : SEED_BRANCHES;

      const cmsItems: CmsItem[] = !cmsSnap.empty
        ? cmsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CmsItem, 'id'>) }))
        : SEED_CMS_ITEMS;

      const showcasePosts: CommunityPost[] = !projSnap.empty
        ? projSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<CommunityPost, 'id'>) }))
            .filter((p) => p.postType === 'Project Showcase')
        : [];

      const publishedPosters: GeneratedPoster[] =
        publishedPosterSnap && !publishedPosterSnap.empty
          ? publishedPosterSnap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<GeneratedPoster, 'id'>) }))
              .filter((p) => p.status === 'published')
              .sort((a, b) => (b.publishedAt || b.updatedAt || '').localeCompare(a.publishedAt || a.updatedAt || ''))
          : [];

      const brandSettings: BrandSettings =
        brandSnap && brandSnap.exists()
          ? (brandSnap.data() as BrandSettings)
          : DEFAULT_BRAND_SETTINGS;

      const payload: PublicCatalogPayload = {
        courses,
        branches,
        cmsItems,
        showcasePosts,
        specialProgramme: specialProg || DEFAULT_FREE_SKILL_PROGRAMME,
        publishedPosters,
        brandSettings,
        fetchedAt: Date.now(),
      };

      memoryCache = payload;
      writeSessionCache(payload);
      return payload;
    } catch {
      const fallback: PublicCatalogPayload = {
        courses: SEED_COURSES,
        branches: SEED_BRANCHES,
        cmsItems: SEED_CMS_ITEMS,
        showcasePosts: [],
        specialProgramme: DEFAULT_FREE_SKILL_PROGRAMME,
        publishedPosters: [],
        brandSettings: DEFAULT_BRAND_SETTINGS,
        fetchedAt: Date.now(),
      };
      return fallback;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}
