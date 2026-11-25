import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Card } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'
import { useSeo } from '@/lib/seo'

const Shell = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
  <div className="mx-auto grid max-w-md gap-4 px-4 py-10">
    <div className="text-center"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>
    <Card className="p-5">{children}</Card>
  </div>
)

const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') })

export function LoginPage() {
  useSeo({ title: 'Sign in' })
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) })
  return (
    <Shell title="Welcome back" subtitle="Sign in to your SoundFont Hub account">
      <form className="space-y-4" onSubmit={handleSubmit(async (v) => {
        const { error } = await supabase.auth.signInWithPassword(v)
        if (error) return void toast.error(error.message === 'Email not confirmed' ? 'Please verify your email first.' : 'Invalid email or password.')
        nav(from, { replace: true })
      })}>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <Button className="w-full" loading={isSubmitting}>Sign in</Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link className="text-primary hover:underline" to="/forgot-password">Forgot password?</Link>
        <Link className="text-primary hover:underline" to="/register">Create account</Link>
      </div>
    </Shell>
  )
}

const registerSchema = z.object({
  full_name: z.string().min(2, 'Enter your name').max(80),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(10, 'Use at least 10 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'),
})

export function RegisterPage() {
  useSeo({ title: 'Create account' })
  const nav = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) })
  return (
    <Shell title="Create your account" subtitle="Build your personal SoundFont library">
      <form className="space-y-4" onSubmit={handleSubmit(async (v) => {
        const { error } = await supabase.auth.signUp({
          email: v.email, password: v.password,
          options: { data: { full_name: v.full_name }, emailRedirectTo: `${window.location.origin}/login` },
        })
        if (error) return void toast.error(error.message)
        toast.success('Check your email to verify your account.')
        nav('/login')
      })}>
        <Field label="Full name" error={errors.full_name?.message}><Input autoComplete="name" {...register('full_name')} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message} hint="At least 10 characters, with letters and numbers.">
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Button className="w-full" loading={isSubmitting}>Create account</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">Already registered? <Link className="text-primary hover:underline" to="/login">Sign in</Link></p>
    </Shell>
  )
}

export function ForgotPasswordPage() {
  useSeo({ title: 'Reset password' })
  const { register, handleSubmit, formState: { errors, isSubmitting, isSubmitSuccessful } } =
    useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().email('Enter a valid email') })) })
  return (
    <Shell title="Reset your password" subtitle="We will email you a secure reset link">
      {isSubmitSuccessful ? <p className="text-sm">If an account exists for that email, a reset link is on its way.</p> : (
        <form className="space-y-4" onSubmit={handleSubmit(async ({ email }) => {
          await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        })}>
          <Field label="Email" error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
          <Button className="w-full" loading={isSubmitting}>Send reset link</Button>
        </form>
      )}
    </Shell>
  )
}

export function ResetPasswordPage() {
  useSeo({ title: 'Choose a new password' })
  const nav = useNavigate()
  const schema = z.object({ password: z.string().min(10, 'Use at least 10 characters').regex(/\d/, 'Include a number') })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  return (
    <Shell title="Choose a new password" subtitle="Use the link from your email to land here">
      <form className="space-y-4" onSubmit={handleSubmit(async ({ password }) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) return void toast.error(error.message)
        toast.success('Password updated'); nav('/')
      })}>
        <Field label="New password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Button className="w-full" loading={isSubmitting}>Update password</Button>
      </form>
    </Shell>
  )
}
