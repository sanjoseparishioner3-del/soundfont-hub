import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Card } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { InstallButton } from '@/features/pwa/PwaBits'
import { useSeo } from '@/lib/seo'
import { supabase } from '@/lib/supabase'

export default function AccountPage() {
  useSeo({ title: 'Account' })
  const { user, signOut, hasAdminRole, isAdmin } = useAuth()
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<{ full_name: string }>({
    resolver: zodResolver(z.object({ full_name: z.string().min(2).max(80) })),
    defaultValues: { full_name: (user?.user_metadata?.full_name as string) ?? '' },
  })
  if (!user) {
    return (
      <div className="container max-w-md py-10 text-center"><h1 className="mb-2 text-2xl font-bold">Your account</h1>
        <p className="mb-4 text-muted-foreground">Sign in to see your library, orders and favorites.</p>
        <div className="flex justify-center gap-2"><Button asChild><Link to="/login">Sign in</Link></Button><Button asChild variant="outline"><Link to="/register">Create account</Link></Button></div></div>
    )
  }
  const link = 'rounded-md px-3 py-2 text-sm hover:bg-muted'
  return (
    <div className="container max-w-2xl space-y-4 py-6"><h1 className="text-2xl font-bold">Account</h1>
      <Card className="space-y-4 p-5"><p className="text-sm text-muted-foreground">{user.email}</p>
        <form className="space-y-3" onSubmit={handleSubmit(async (v) => {
          const a = await supabase.auth.updateUser({ data: { full_name: v.full_name } })
          const b = await supabase.from('profiles').update({ full_name: v.full_name }).eq('id', user.id)
          if (a.error || b.error) toast.error((a.error ?? b.error)!.message); else toast.success('Profile updated')
        })}><Field label="Full name" error={errors.full_name?.message}><Input {...register('full_name')} /></Field><Button loading={isSubmitting}>Save</Button></form></Card>
      <Card className="flex flex-col p-2"><Link className={link} to="/library">My Sound Library</Link><Link className={link} to="/account/orders">Order history</Link><Link className={link} to="/favorites">Favorites</Link><Link className={link} to="/support">Support tickets</Link>
        {hasAdminRole && <Link className={`${link} text-primary`} to={isAdmin ? '/admin' : '/account/mfa'}>{isAdmin ? 'Admin dashboard' : 'Set up two-factor authentication (admin)'}</Link>}</Card>
      <div className="flex gap-2"><InstallButton /><Button variant="outline" onClick={() => void signOut()}>Sign out</Button></div>
    </div>
  )
}
