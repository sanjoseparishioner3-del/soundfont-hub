insert into public.supported_applications (slug, name, platforms, sort_order) values
  ('audio-evolution-mobile','Audio Evolution Mobile','Android, iOS',1),
  ('onstage','OnStage','iOS, Android',2),
  ('numa-player','Numa Player','iOS, Android',3),
  ('fluidsynth','FluidSynth','Windows, macOS, Linux',4)
on conflict (slug) do nothing;
