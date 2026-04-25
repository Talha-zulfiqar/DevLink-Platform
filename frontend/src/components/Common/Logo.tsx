import React from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  variant?: 'light' | 'dark';
  showText?: boolean;
  className?: string;
}

export default function Logo({ variant = 'light', showText = true, className = '' }: LogoProps) {
  const isDark = variant === 'dark';
  const textColor = isDark ? 'text-white' : 'text-gray-900';
  const hoverTextColor = isDark ? 'group-hover:text-blue-100' : 'group-hover:text-blue-700';

  return (
    <Link to="/" className={`flex items-center gap-2 group ${className}`}>
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-2xl transition-all duration-300 group-hover:scale-105"
        style={{
          background: 'linear-gradient(135deg,#0066FF 0%,#8B5CF6 100%)',
          boxShadow: '0 8px 24px rgba(11,24,55,0.15)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 12h18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 7h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          <path d="M7 17h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        </svg>
      </div>
      {showText && (
        <span className={`text-xl font-bold ${textColor} ${hoverTextColor} transition-colors`}>
          DevLink
        </span>
      )}
    </Link>
  );
}
