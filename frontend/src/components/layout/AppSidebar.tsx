import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Wallet,
  Target,
  Settings,
  LogOut,
  Languages,
  ChevronsUpDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/stores/auth-store'
import { useAppStore } from '@/stores/app-store'
import { useLogout } from '@/features/auth/hooks'
import { cn } from '@/lib/utils'
import picsouLogo from '@/assets/horizontal-white-picsou.svg'

function NavItem({
  to,
  end,
  icon: Icon,
  title,
  description,
}: {
  to: string
  end?: boolean
  icon: LucideIcon
  title: string
  description: string
}) {
  const location = useLocation()
  const isActive = end
    ? location.pathname === to
    : location.pathname.startsWith(to)

  return (
    <Item
      asChild
      variant={isActive ? 'muted' : 'default'}
      className={cn(
        'rounded-xl px-4 py-3',
        isActive && 'bg-muted ring-1 ring-border',
      )}
    >
      <NavLink to={to} end={end}>
        <ItemMedia
          variant="icon"
          className={cn(
            'flex size-10 items-center justify-center rounded-lg',
            isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-5" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="text-sm font-semibold">{title}</ItemTitle>
          <ItemDescription className="text-xs">{description}</ItemDescription>
        </ItemContent>
      </NavLink>
    </Item>
  )
}

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard', descKey: 'nav.dashboard.desc' },
  { path: '/accounts', icon: Wallet, labelKey: 'nav.accounts', descKey: 'nav.accounts.desc' },
  { path: '/goals', icon: Target, labelKey: 'nav.goals', descKey: 'nav.goals.desc' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings', descKey: 'nav.settings.desc' },
] as const

export function AppSidebar() {
  const { t, i18n } = useTranslation()
  const username = useAuthStore((s) => s.username)
  const demoMode = useAppStore((s) => s.demoMode)
  const logoutMutation = useLogout()

  const displayName = demoMode ? 'Demo' : username ?? ''
  const initial = displayName.charAt(0).toUpperCase()

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr')
  }

  return (
    <nav className="flex h-fit max-h-[calc(100vh-2rem)] w-60 shrink-0 flex-col bg-background px-3 py-4 rounded-xl">
      {/* Logo */}
      <img src={picsouLogo} alt="Picsou" className="h-7 w-auto opacity-90" />

      {/* Nav items — evenly distributed */}
      <div className="flex flex-1 flex-col justify-evenly gap-3 mt-[47px]">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            icon={item.icon}
            title={t(item.labelKey)}
            description={t(item.descKey)}
          />
        ))}
      </div>

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Item asChild variant="default" className="rounded-xl px-4 py-3 cursor-pointer hover:bg-muted transition-colors">
            <button type="button">
              <ItemMedia
                variant="icon"
                className="flex size-10 items-center justify-center rounded-lg bg-muted"
              >
                <Avatar className="size-5">
                  <AvatarFallback className="text-[8px] font-semibold">
                    {initial}
                  </AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">{displayName}</ItemTitle>
                <ItemDescription className="text-xs">
                  <ChevronsUpDown className="inline size-3" />
                </ItemDescription>
              </ItemContent>
            </button>
          </Item>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={4} className="w-52">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium leading-none">{displayName}</p>
              {demoMode && <p className="text-xs text-muted-foreground">Demo mode</p>}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleLanguage}>
            <Languages className="mr-2 size-4" />
            {t('settings.language')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
            <LogOut className="mr-2 size-4" />
            {t('settings.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
