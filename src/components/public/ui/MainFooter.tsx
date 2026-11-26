import React from 'react';
import { Globe, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { BRAND_IMAGES, INSTITUTE_INFO } from '../../../data/catalogSeed';
import { PublicPage } from '../../../lib/publicRoutes';
import { PWAInstallButton, ThemeToggleButton } from '../../common/PlatformWidgets';

interface MainFooterProps {
  courseCount: number;
  isSignedIn: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onNavigate: (page: PublicPage, param?: string) => void;
  onSelectDomainCourses: (domain: string) => void;
  onPortalAction: () => void;
}

export const MainFooter: React.FC<MainFooterProps> = React.memo(({
  courseCount,
  isSignedIn,
  theme,
  toggleTheme,
  onNavigate,
  onSelectDomainCourses,
  onPortalAction,
}) => {
  return (
    <footer className="bg-[#101D35] text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-slate-800">
          {/* Column 1: Official Logo & Identity */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/15 bg-[#172A45] shrink-0">
                <img
                  src={BRAND_IMAGES.officialLogo}
                  alt="TECHMAN COLLEGE Official Logo"
                  width={48}
                  height={48}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="text-base font-extrabold tracking-tight text-white">
                  {INSTITUTE_INFO.officialName}
                </div>
                <div className="text-xs font-medium text-sky-300">
                  {INSTITUTE_INFO.establishedLabel} · Sri Lanka
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              A futuristic Sri Lankan educational platform dedicated to Artificial Intelligence,
              technology, creative design, and professional skill development — powered by a
              unified digital Learning Management System.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={`https://wa.me/${INSTITUTE_INFO.whatsappDigits}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#172A45] hover:bg-emerald-700 text-xs font-medium text-white transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </a>
              <a
                href={INSTITUTE_INFO.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#172A45] hover:bg-[#1677FF] text-xs font-medium text-white transition"
              >
                <Globe className="w-3.5 h-3.5" />
                techmemai.lk
              </a>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white mb-4">
              Quick Links
            </h3>
            <ul className="space-y-2.5 text-xs">
              {(
                [
                  ['home', 'Home'],
                  ['about', 'About Us'],
                  ['academics', 'Academics'],
                  ['lecturers', 'Lecturers'],
                  ['campus', 'Campuses'],
                  ['events', 'Events & Workshops'],
                  ['notices', 'Official Notices'],
                  ['contact', 'Contact'],
                ] as [PublicPage, string][]
              ).map(([target, label]) => (
                <li key={target}>
                  <button
                    type="button"
                    onClick={() => onNavigate(target)}
                    className="text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Courses & Programmes */}
          <div className="lg:col-span-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white mb-4">
              Courses &amp; Programmes
            </h3>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('free-skill-programme')}
                  className="text-sky-300 hover:text-white font-semibold transition cursor-pointer"
                >
                  Free Skill Development Programme (100% Free)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('courses')}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  All {courseCount} Published Courses
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectDomainCourses('AI & Automation')}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Artificial Intelligence &amp; Automation
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectDomainCourses('Creative Design')}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Graphic Design &amp; Creative Technology
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectDomainCourses('IT & Software')}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Web &amp; App Development
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('career')}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Career Centre &amp; Internships
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('library')}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Digital Library
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Student Support & Contact */}
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white">
              Student Support &amp; Contact
            </h3>
            <div className="space-y-2.5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#1677FF] shrink-0" />
                <span className="font-mono text-slate-200">{INSTITUTE_INFO.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#1677FF] shrink-0" />
                <span>{INSTITUTE_INFO.publicEmail}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#1677FF] shrink-0" />
                <span>Colombo · Panadura · Kalutara · Kandy · Online</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => (isSignedIn ? onPortalAction() : onNavigate('student-login'))}
                className="w-full py-2.5 px-4 rounded-lg bg-[#1677FF] hover:bg-blue-600 text-white text-xs font-semibold transition cursor-pointer"
              >
                {isSignedIn ? 'Open Role-Scoped LMS Portal' : 'Student / Lecturer / Admin Login'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('verify')}
                className="w-full py-2 px-4 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-200 hover:text-white text-xs font-medium transition cursor-pointer"
              >
                Verify Digital Certificate (QR)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <PWAInstallButton compact />
              <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            © {INSTITUTE_INFO.establishedYear}–2027 {INSTITUTE_INFO.officialName}.{' '}
            {INSTITUTE_INFO.establishedLabel}. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onNavigate('privacy-policy')}
              className="hover:text-white transition cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('terms')}
              className="hover:text-white transition cursor-pointer"
            >
              Terms &amp; Conditions
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
});
