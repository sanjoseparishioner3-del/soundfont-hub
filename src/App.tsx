import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { SiteLayout } from '@/components/layout/SiteLayout'
import { Button } from '@/components/ui/button'
import { RequireAdmin, RequireAuth } from '@/features/auth/guards'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '@/features/auth/AuthPages'
import HomePage from '@/features/catalog/HomePage'

const L = {
  Explore: lazy(() => import('@/features/catalog/ExplorePage')),
  Product: lazy(() => import('@/features/catalog/ProductPage')),
  Bundles: lazy(() => import('@/features/catalog/BundlePages').then((m) => ({ default: m.BundlesPage }))),
  BundleDetail: lazy(() => import('@/features/catalog/BundlePages').then((m) => ({ default: m.BundleDetailPage }))),
  Cart: lazy(() => import('@/features/shop/CartPage')),
  Order: lazy(() => import('@/features/shop/OrderPage')),
  Orders: lazy(() => import('@/features/shop/OrderPage').then((m) => ({ default: m.OrdersListPage }))),
  Library: lazy(() => import('@/features/library/LibraryPage')),
  Favorites: lazy(() => import('@/features/library/LibraryPage').then((m) => ({ default: m.FavoritesPage }))),
  Account: lazy(() => import('@/features/account/AccountPage')),
  Mfa: lazy(() => import('@/features/auth/MfaPage')),
  Keyboard: lazy(() => import('@/features/keyboard/KeyboardPage')),
  Learn: lazy(() => import('@/features/content/ContentPages').then((m) => ({ default: m.LearnPage }))),
  Tutorial: lazy(() => import('@/features/content/ContentPages').then((m) => ({ default: m.TutorialPage }))),
  Policy: lazy(() => import('@/features/content/ContentPages').then((m) => ({ default: m.PolicyPage }))),
  Support: lazy(() => import('@/features/support/SupportPages').then((m) => ({ default: m.SupportListPage }))),
  Ticket: lazy(() => import('@/features/support/SupportPages').then((m) => ({ default: m.TicketPage }))),
  AdminLayout: lazy(() => import('@/features/admin/AdminLayout')),
  Dashboard: lazy(() => import('@/features/admin/DashboardPage')),
  Soundfonts: lazy(() => import('@/features/admin/SoundfontsAdmin')),
  Bundle: lazy(() => import('@/features/admin/BundlesAdmin')),
  Orders2: lazy(() => import('@/features/admin/OrdersAdmin').then((m) => ({ default: m.OrdersAdmin }))),
  Reports: lazy(() => import('@/features/admin/OrdersAdmin').then((m) => ({ default: m.ReportsAdmin }))),
  PaySettings: lazy(() => import('@/features/admin/SettingsAdmin').then((m) => ({ default: m.PaymentSettingsAdmin }))),
  SysSettings: lazy(() => import('@/features/admin/SettingsAdmin').then((m) => ({ default: m.SystemSettingsAdmin }))),
  Categories: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.CategoriesAdmin }))),
  Announcements: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.AnnouncementsAdmin }))),
  Tutorials: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.TutorialsAdmin }))),
  Promotions: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.PromotionsAdmin }))),
  Reviews: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.ReviewsAdmin }))),
  Downloads: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.DownloadLogsAdmin }))),
  Audit: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.AuditLogsAdmin }))),
  Tickets: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.TicketsAdmin }))),
  Customers: lazy(() => import('@/features/admin/SimpleAdminPages').then((m) => ({ default: m.CustomersAdmin }))),
}

const Fallback = () => <div className="container py-10"><div className="skeleton h-40" /></div>
const NotFound = () => (
  <div className="container grid place-items-center gap-3 py-24 text-center"><h1 className="text-3xl font-bold">Page not found</h1><Button asChild><Link to="/">Back home</Link></Button></div>
)

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="explore" element={<L.Explore />} />
          <Route path="sounds/:slug" element={<L.Product />} />
          <Route path="bundles" element={<L.Bundles />} />
          <Route path="bundles/:slug" element={<L.BundleDetail />} />
          <Route path="keyboard" element={<L.Keyboard />} />
          <Route path="learn" element={<L.Learn />} />
          <Route path="learn/:slug" element={<L.Tutorial />} />
          <Route path="page/:key" element={<L.Policy />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="account" element={<L.Account />} />
          <Route element={<RequireAuth />}>
            <Route path="cart" element={<L.Cart />} />
            <Route path="checkout/:id" element={<L.Order />} />
            <Route path="account/orders" element={<L.Orders />} />
            <Route path="account/orders/:id" element={<L.Order />} />
            <Route path="account/mfa" element={<L.Mfa />} />
            <Route path="library" element={<L.Library />} />
            <Route path="favorites" element={<L.Favorites />} />
            <Route path="support" element={<L.Support />} />
            <Route path="support/:id" element={<L.Ticket />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route element={<RequireAdmin />}>
          <Route path="admin" element={<L.AdminLayout />}>
            <Route index element={<L.Dashboard />} />
            <Route path="soundfonts" element={<L.Soundfonts />} />
            <Route path="categories" element={<L.Categories />} />
            <Route path="collections" element={<L.Bundle kind="collections" />} />
            <Route path="bundles" element={<L.Bundle kind="bundles" />} />
            <Route path="orders" element={<L.Orders2 />} />
            <Route path="payments" element={<L.Orders2 pendingOnly />} />
            <Route path="customers" element={<L.Customers />} />
            <Route path="downloads" element={<L.Downloads />} />
            <Route path="promotions" element={<L.Promotions />} />
            <Route path="reviews" element={<L.Reviews />} />
            <Route path="announcements" element={<L.Announcements />} />
            <Route path="tutorials" element={<L.Tutorials />} />
            <Route path="tickets" element={<L.Tickets />} />
            <Route path="reports" element={<L.Reports />} />
            <Route path="payment-settings" element={<L.PaySettings />} />
            <Route path="settings" element={<L.SysSettings />} />
            <Route path="audit" element={<L.Audit />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
