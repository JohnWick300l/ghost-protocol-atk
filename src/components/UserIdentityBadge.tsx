import React from 'react';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import {
  resolveUserDisplayIdentity,
  resolveAuthorDisplayFromRegistry
} from '../utils/rules';

interface UserIdentityBadgeProps {
  user?: Partial<User> | null;
  userId?: string | null;
  fallbackName?: string | null;
  fallbackModel?: string | null;
  layout?: 'stacked' | 'inline';
  size?: 'xs' | 'sm' | 'md';
  showRoleBadge?: boolean;
  className?: string;
}

export const UserIdentityBadge: React.FC<UserIdentityBadgeProps> = ({
  user,
  userId,
  fallbackName,
  fallbackModel,
  layout = 'inline',
  size = 'sm',
  showRoleBadge = false,
  className = ''
}) => {
  const { availableUsers } = useAuth();

  const resolved = user
    ? resolveUserDisplayIdentity(user)
    : resolveAuthorDisplayFromRegistry(
        userId,
        fallbackName,
        availableUsers,
        fallbackModel
      );

  const primaryTextClass =
    size === 'xs'
      ? 'text-xs font-semibold text-[#F1F3F5]'
      : size === 'md'
      ? 'text-sm font-semibold text-[#F1F3F5]'
      : 'text-xs sm:text-sm font-semibold text-[#F1F3F5]';

  const secondaryTagClass =
    size === 'xs'
      ? 'text-[9px] font-mono text-[#8E98A4] tracking-wide'
      : 'text-[10px] font-mono text-[#8E98A4] tracking-wide';

  if (layout === 'stacked') {
    return (
      <div className={`inline-flex flex-col min-w-0 ${className}`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`${primaryTextClass} truncate`}>{resolved.primaryName}</span>
          {showRoleBadge && resolved.roleLabel === 'OWNER' && (
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/35 font-bold uppercase shrink-0">
              OWNER
            </span>
          )}
          {showRoleBadge && resolved.roleLabel === 'ADMIN' && (
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#729BCB]/15 text-[#729BCB] border border-[#729BCB]/35 font-bold uppercase shrink-0">
              ADMIN
            </span>
          )}
        </div>
        {resolved.secondaryTag && (
          <span className={`${secondaryTagClass} mt-0.5 leading-tight`}>
            {resolved.secondaryTag}
          </span>
        )}
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      <span className={primaryTextClass}>{resolved.primaryName}</span>
      {resolved.secondaryTag && (
        <span
          className={`${secondaryTagClass} px-1.5 py-0.2 rounded bg-[#161B22] border border-[#282D34] text-[#94A3B8] font-normal shrink-0`}
        >
          {resolved.secondaryTag}
        </span>
      )}
      {showRoleBadge && resolved.roleLabel === 'OWNER' && (
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#42B883]/15 text-[#42B883] border border-[#42B883]/35 font-bold uppercase shrink-0">
          OWNER
        </span>
      )}
      {showRoleBadge && resolved.roleLabel === 'ADMIN' && (
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#729BCB]/15 text-[#729BCB] border border-[#729BCB]/35 font-bold uppercase shrink-0">
          ADMIN
        </span>
      )}
    </span>
  );
};
