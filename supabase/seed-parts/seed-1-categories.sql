insert into public.categories (slug, name, sort_order) values
  ('grand-piano','Grand Piano',1),('acoustic-piano','Acoustic Piano',2),('electric-piano','Electric Piano',3),
  ('worship-piano','Worship Piano',4),('ambient-pads','Ambient Pads',5),('warm-pads','Warm Pads',6),
  ('strings','Strings',7),('organ','Organ',8),('synthesizer','Synthesizer',9),('brass','Brass',10),
  ('bass','Bass',11),('guitar','Guitar',12),('drums','Drums',13),('lead-sounds','Lead Sounds',14),
  ('orchestral','Orchestral',15),('layered-sounds','Layered Sounds',16),
  ('worship-collections','Worship Collections',17),('complete-bundles','Complete SoundFont Bundles',18)
on conflict (slug) do nothing;
