-- =====================================================================
-- 0017_cms_seed.sql — the current site, as data
--
-- Every row below is the value the application was shipping as a TypeScript
-- literal before this sprint. Nothing here is new copy: the point is that
-- applying 0015–0017 changes the homepage not at all, and the only difference
-- afterwards is that an operator can edit it.
--
-- `on conflict do nothing` throughout, so this is safe to re-run and — more
-- importantly — will not overwrite an edit somebody has already made in the
-- admin panel. A re-seed is a floor, not a reset.
--
-- Two deliberate omissions:
--   · `testimonials` is seeded empty. The page's rule against invented social
--     proof is not something a migration gets to break.
--   · `ai_providers.generation_ready` mirrors lib/ai/catalogue.ts exactly, so
--     the nine vendors with no driver are stored as not ready.
--
-- Runs in its own transaction, after 0015, because it writes rows naming the
-- enum values that migration added.
-- =====================================================================

-- =====================================================================
-- SETTINGS
-- =====================================================================
insert into public.app_settings (key, value, category, label, description, is_public, sort_order)
values
  -- ---------------------------------------------------------------- site
  ('site.name',        '"Kinetic Studio"'::jsonb,            'site', 'Site name',        'Used in the wordmark, the page title and every email.', true, 10),
  ('site.short_name',  '"Kinetic"'::jsonb,                    'site', 'Short name',       'For the places that cannot fit two words: a 40px sidebar rail.', true, 20),
  ('site.tagline',     '"The AI creative workspace"'::jsonb,  'site', 'Tagline',          'One line, shown after the name in the title bar and the footer.', true, 30),
  ('site.description',
   '"Kinetic Studio is a workspace for making images and video with open models. One composer, one credit balance, your own API keys — from a prompt to a finished shot without leaving the page."'::jsonb,
   'site', 'Description', 'The meta description and the default Open Graph description.', true, 40),
  ('site.support_email', '"support@kinetic.studio"'::jsonb,   'site', 'Support email',    'Shown in the footer and on the billing page.', true, 50),

  -- ----------------------------------------------------------------- seo
  ('seo.title_template', '"%s · Kinetic Studio"'::jsonb,      'seo', 'Title template',    'How a child page title is composed. %s is the page name.', true, 10),
  ('seo.default_title',  '"Kinetic Studio — The AI creative workspace"'::jsonb, 'seo', 'Default title', 'The title of the landing page itself.', true, 20),
  ('seo.keywords',       '["ai video","image generation","open models","flux","wan 2.2","creative studio"]'::jsonb,
   'seo', 'Keywords', 'Comma-separated. Worth little for ranking; harmless to set.', true, 30),
  ('seo.og_image_url',   'null'::jsonb,                        'seo', 'Open Graph image',  'The 1200×630 card image. Falls back to the generated OG route when empty.', true, 40),
  ('seo.twitter_handle', 'null'::jsonb,                        'seo', 'Twitter handle',    'Without the @. Populates twitter:site on every page.', true, 50),
  ('seo.robots_index',   'true'::jsonb,                        'seo', 'Allow indexing',    'Off writes a blanket disallow into robots.txt. Use for a staging deploy.', true, 60),

  -- ------------------------------------------------------------- branding
  ('branding.logo_url',     'null'::jsonb,                     'branding', 'Logo',          'Replaces the built-in mark. SVG or a transparent PNG.', true, 10),
  ('branding.favicon_url',  'null'::jsonb,                     'branding', 'Favicon',       'Falls back to the built-in icon route when empty.', true, 20),
  ('branding.wordmark_text', '"Kinetic Studio"'::jsonb,         'branding', 'Wordmark text', 'The text beside the mark. Usually the site name.', true, 30),
  ('branding.show_wordmark', 'true'::jsonb,                     'branding', 'Show wordmark', 'Off leaves just the mark.', true, 40),

  -- ---------------------------------------------------------------- theme
  -- Stored as the oklch() strings globals.css defines, so a value pasted from
  -- the stylesheet works and an edit is reversible by pasting the old one back.
  ('theme.color_primary',    '"oklch(0.8 0.135 200)"'::jsonb,   'theme', 'Primary',        'The one colour that means "do this": buttons, focus, progress.', true, 10),
  ('theme.color_accent',     '"oklch(0.7 0.175 35)"'::jsonb,    'theme', 'Accent',         'The second voice. Marks and annotates; never fills a primary button.', true, 20),
  ('theme.color_background', '"oklch(0.175 0.007 250)"'::jsonb, 'theme', 'Background',     'The canvas. Graphite, not black.', true, 30),
  ('theme.color_surface',    '"oklch(0.215 0.008 250)"'::jsonb, 'theme', 'Surface',        'Panels and cards, one step up from the canvas.', true, 40),
  ('theme.color_credit',     '"oklch(0.83 0.145 88)"'::jsonb,   'theme', 'Credit',         'Credits are money, so they get their own warm channel.', true, 50),
  ('theme.radius',           '"0.625rem"'::jsonb,               'theme', 'Corner radius',  'The base radius. Buttons and cards derive from it.', true, 60),
  ('theme.font_sans',        '"Inter"'::jsonb,                  'theme', 'Interface font', 'Must be one of the fonts the app bundles.', true, 70),
  ('theme.font_display',     '"Space Grotesk"'::jsonb,          'theme', 'Display font',   'Headings only.', true, 80),
  ('theme.mode',             '"dark"'::jsonb,                   'theme', 'Colour mode',    'This build is designed dark-only; light is not a supported target.', true, 90),
  ('theme.animations',       'true'::jsonb,                     'theme', 'Animations',     'Off disables reveal transitions and the preset marquee site-wide.', true, 100),

  -- ----------------------------------------------------------- generation
  ('generation.default_task',        '"text_to_image"'::jsonb,  'generation', 'Default task',         'Which tab the composer opens on.', false, 10),
  ('generation.default_image_model', '"lumen-flash"'::jsonb,    'generation', 'Default image model',  'Must be a model id from lib/ai/registry.ts.', false, 20),
  ('generation.default_video_model', '"motion-turbo"'::jsonb,   'generation', 'Default video model',  'Must be a model id from lib/ai/registry.ts.', false, 30),
  ('generation.default_provider',    '"huggingface"'::jsonb,    'generation', 'Preferred provider',   'Tried first when a user has keys for several. The registry order wins when unset.', false, 40),

  -- --------------------------------------------------------------- limits
  ('limits.max_prompt_length',  '1200'::jsonb,                  'limits', 'Prompt length',      'Characters. The composer counts down to it.', true, 10),
  ('limits.max_upload_mb',      '10'::jsonb,                    'limits', 'Upload size',        'Megabytes. The storage bucket enforces its own ceiling too.', true, 20),
  ('limits.job_timeout_minutes','6'::jsonb,                     'limits', 'Job timeout',        'After this the sweeper fails a stuck job and refunds it.', false, 30),

  -- -------------------------------------------------------------- storage
  ('storage.provider',        '"supabase"'::jsonb,              'storage', 'Storage provider',  'Supabase Storage is the only driver in this build.', false, 10),
  ('storage.uploads_bucket',  '"uploads"'::jsonb,               'storage', 'Uploads bucket',    'Private, one folder per user.', false, 20),
  ('storage.media_bucket',    '"generations"'::jsonb,           'storage', 'Public bucket',     'Public read. Where generated media and CMS uploads land.', false, 30),

  -- ---------------------------------------------------------------- legal
  ('legal.copyright',
   '"An independent portfolio project, not affiliated with any commercial AI video service."'::jsonb,
   'legal', 'Copyright line', 'Printed under the footer rule, after the year.', true, 10),
  ('legal.billing_disclaimer',
   '"Checkout is simulated — no payment provider is connected, no card is charged and no card details are stored."'::jsonb,
   'legal', 'Billing disclaimer', 'Shown wherever a price appears. Removing it would make the pricing page dishonest.', true, 20)
on conflict (key) do nothing;

-- =====================================================================
-- FEATURE FLAGS
-- =====================================================================
insert into public.feature_flags (key, label, description, enabled, category, sort_order)
values
  ('explore',          'Explore feed',        'The public feed at /explore and every permalink under /g.',              true,  'surfaces', 10),
  ('generation',       'Generation',          'Off puts the composer in read-only mode and refuses new jobs. Running jobs still finish.', true, 'surfaces', 20),
  ('billing',          'Billing',             'The plan and checkout surfaces. Off hides pricing everywhere.',          true,  'commerce', 30),
  ('providers',        'Bring your own keys', 'Settings → AI model keys. Off hides the tab; stored keys keep working.', true,  'commerce', 40),
  ('registration',     'Registration',        'Off closes signup. Existing accounts sign in as normal.',                true,  'access',   50),
  ('comments',         'Comments',            'Threads on published shots.',                                            true,  'social',   60),
  ('downloads',        'Downloads',           'The download button on a published shot. Owners can always download their own.', true, 'social', 70),
  ('likes',            'Likes',               'The like button and the counter behind it.',                              true,  'social',   80),
  ('announcements',    'Announcements',       'The banner. Off suppresses every scheduled announcement at once.',        true,  'content',  90),
  ('testimonials',     'Testimonials',        'The testimonials band. Renders only when there is something to show.',   true,  'content', 100),
  ('maintenance_mode', 'Maintenance mode',    'Shows a maintenance notice instead of the studio. Staff keep full access.', false, 'system', 110)
on conflict (key) do nothing;

-- =====================================================================
-- LANDING SECTIONS
-- =====================================================================
insert into public.landing_sections (key, label, index_label, eyebrow, title, lead, cta_label, cta_href, config, is_visible, sort_order)
values
  ('hero', 'Hero', null, null,
   $t$A workspace where stills move.$t$,
   $t$Kinetic Studio puts every open image and video model behind one composer. Write a prompt, pick a camera move, and get a finished shot back — with the credit cost on screen before you spend it.$t$,
   'Start creating free', '/sign-up',
   -- `highlight` is the phrase the cyan underline sits beneath; it has to be a
   -- substring of the title or the headline renders without its one piece of
   -- colour. `secondary_*` is the outline button beside the primary one.
   $j${"highlight": "stills move", "signed_in_cta_label": "Open the composer", "signed_in_cta_href": "/create", "secondary_cta_label": "Browse the feed", "secondary_cta_href": "/explore", "show_marquee": true, "show_console": true}$j$::jsonb,
   true, 10),

  ('stats', 'Statistics', null, 'Runs on', null,
   $t$Every model open-weight, every licence permissive.$t$,
   null, null, '{"show_providers": true}'::jsonb, true, 20),

  ('overview', 'Product overview', '01', 'The workspace',
   $t$Five surfaces, one balance, no exports in between$t$,
   $t$Most of the work in AI video is the shuffling: generate here, download, re-upload there, lose track of which prompt made which file. Kinetic Studio is one workspace with one asset store behind it.$t$,
   null, null, '{}'::jsonb, true, 30),

  ('capabilities', 'Capabilities', '02', 'Capabilities',
   $t$Three things to ask for, one place to ask$t$,
   $t$The composer switches between them with a segmented control. The prompt, the reference image and the credit balance travel with you.$t$,
   'Open the composer', '/create', '{"tinted": true}'::jsonb, true, 40),

  ('models', 'Model library', '03', 'Supported models',
   $t$The whole roster, with the real numbers on it$t$,
   $t$Connect whichever account you already have — the controls, the credits and the job feed do not change underneath you.$t$,
   'Connect your keys', '/settings/keys', '{}'::jsonb, true, 50),

  ('workflow', 'How it works', '04', 'How it works',
   $t$Four steps, and the fourth one loops$t$,
   $t$Nothing here is a wizard you have to finish. Every stage is a control you can come back to, and every result remembers the settings that produced it.$t$,
   null, null, '{"tinted": true}'::jsonb, true, 60),

  ('showcase', 'Creator showcase', '05', 'From the feed',
   $t$Made in Kinetic Studio$t$,
   $t$Published by people using the presets you get on day one. Open any of them and hit remix — the prompt, the preset and the seed come with it.$t$,
   'Open Explore', '/explore', '{"limit": 8}'::jsonb, true, 70),

  ('features', 'Feature highlights', '06', 'Built in',
   $t$The parts you would otherwise wire up yourself$t$,
   $t$None of this is an add-on or a higher tier. It is what the workspace does on the free plan, on day one.$t$,
   null, null, '{"tinted": true}'::jsonb, true, 80),

  ('pricing', 'Pricing', '07', 'Pricing',
   $t$Credits, not seats$t$,
   $t$You pay for renders, not for logging in.$t$,
   null, null, '{"align": "center", "show_comparison": true, "show_disclaimer": true}'::jsonb, true, 90),

  ('testimonials', 'Testimonials', null, 'What people say',
   $t$From the people using it$t$,
   null, null, null, '{"tinted": true}'::jsonb, true, 100),

  ('faq', 'FAQ', '08', 'Questions',
   $t$Before you sign up$t$,
   $t$Including the two most products bury: what it costs, and whether the billing is real.$t$,
   'Look at the feed first', '/explore', '{}'::jsonb, true, 110),

  ('cta', 'Closing call to action', null, 'Start here',
   $t$Your first shot is {credits} credits away$t$,
   $t$Sign up, pick a camera move, and watch a still frame start moving. No card, and you can plug in your own API keys whenever you want to.$t$,
   'Create your account', '/sign-up',
   $j${"highlight": "{credits} credits", "signed_in_cta_label": "Open the composer", "signed_in_cta_href": "/create", "secondary_cta_label": "Connect your API keys", "secondary_cta_href": "/settings/keys"}$j$::jsonb,
   true, 120)
on conflict (key) do nothing;

-- =====================================================================
-- STATISTICS
--
-- Three counted, one literal. `signup_credits` reads the free plan's grant, so
-- the number on the homepage and the number the trigger awards are the same
-- number by construction.
-- =====================================================================
insert into public.site_stats (key, label, detail, value_kind, literal_value, sort_order)
values
  ('models',         'Open models',       'image and video',            'models',         null, 10),
  ('presets',        'Presets',           'camera moves and styles',    'presets',        null, 20),
  ('providers',      'Providers',         'bring your own key',         'providers',      null, 30),
  ('signup_credits', 'Credits on signup', 'no card required',           'signup_credits', null, 40)
on conflict (key) do nothing;

-- =====================================================================
-- WORKFLOW STEPS
-- =====================================================================
insert into public.workflow_steps (title, body, artefact, sort_order)
select * from (values
  ('Describe the shot',
   $t$A sentence is enough. Add a reference image if you have one — the same panel takes both.$t$,
   'prompt + reference.jpg', 10),
  ('Pick a move and a model',
   $t$A preset carries the camera language, the negative prompt and the parameters that make the move read. The model selector shows what each one costs.$t$,
   'preset: slow push · Motion Cine', 20),
  ('Queue it',
   $t$Two jobs run at once on the free plan. The card streams from queued to rendering to ready without a refresh, and the credits leave your balance only once the job is accepted.$t$,
   'job 8f21 · rendering · 41%', 30),
  ('Use it',
   $t$Download the original, file it into a project, publish it to Explore, or pull it back into the composer and change one value.$t$,
   'shot-04.mp4 · 1920×1080', 40)
) as seed(title, body, artefact, sort_order)
where not exists (select 1 from public.workflow_steps);

-- =====================================================================
-- FEATURES
--
-- Two placements. 'features' is the bento grid (band 06) and keeps the Tailwind
-- spans that make the grid asymmetric; 'overview' is the three-point column
-- beside the surface map in band 01.
-- =====================================================================
insert into public.site_features (placement, title, body, span, sort_order)
select * from (values
  ('features', 'Presets that carry real craft',
   $t$Each one pins a prompt fragment, a negative prompt and the model parameters behind a camera move. Browse them, preview them, apply one in a click.$t$,
   'lg:col-span-3', 10),
  ('features', 'Live job feed',
   $t$Cards stream queued → rendering → ready without a refresh, with a progress bar that comes from the provider rather than a timer.$t$,
   'lg:col-span-3', 20),
  ('features', 'Remix anything',
   $t$Every shot keeps its prompt, preset, model and seed. Pull one back into the composer and change one value.$t$,
   'lg:col-span-2', 30),
  ('features', 'Publish to Explore',
   $t$Share a shot to the public feed, or keep everything private. Likes and remix counts are per shot.$t$,
   'lg:col-span-2', 40),
  ('features', 'Refunds on failure',
   $t$A provider error returns the credits automatically, in the same transaction that marks the job failed.$t$,
   'lg:col-span-2', 50)
) as seed(placement, title, body, span, sort_order)
where not exists (select 1 from public.site_features where placement = 'features');

insert into public.site_features (placement, title, body, sort_order)
select * from (values
  ('overview', 'One surface, not five tools',
   $t$Generate a still and animate it in the same panel. Nothing is exported, re-uploaded or renamed in between.$t$, 10),
  ('overview', 'The cost is on screen before you spend it',
   $t$Every model shows its credit price in the selector. The balance updates the moment a job is accepted, and a failed job refunds itself.$t$, 20),
  ('overview', 'Your keys, your quota',
   $t$Connect a Hugging Face, fal.ai or Replicate account and your generations run on it. Encrypted at rest, removable in one click.$t$, 30)
) as seed(placement, title, body, sort_order)
where not exists (select 1 from public.site_features where placement = 'overview');

-- The three capability cards. `detail` is the line under the body, set off by a
-- coral rule; `icon` is resolved through the allow-list in lib/admin/icons.ts.
-- `href` carries the generation task, because that is the join to the registry
-- the card counts models from.
insert into public.site_features (placement, title, body, detail, icon, href, sort_order)
select * from (values
  ('capabilities', 'Text to image',
   $t$A sentence and a style preset return a finished frame. Five aspect ratios, seeds you can reuse, negative prompts when you need to exclude something.$t$,
   $t$Reach for it to find the frame before you spend anything animating it.$t$,
   'Image', 'text_to_image', 10),
  ('capabilities', 'Image to video',
   $t$Drop in a still and pick a camera move. The preset carries the prompt language and the model parameters that make a push, an orbit or a crash zoom actually read.$t$,
   $t$The shortest path from a photograph you already like to a shot.$t$,
   'Film', 'image_to_video', 20),
  ('capabilities', 'Text to video',
   $t$Straight from a description to moving footage, with no start frame. Useful when the look in your head has no reference to upload.$t$,
   $t$Five and ten second passes, up to 21:9.$t$,
   'Video', 'text_to_video', 30)
) as seed(placement, title, body, detail, icon, href, sort_order)
where not exists (select 1 from public.site_features where placement = 'capabilities');

-- =====================================================================
-- FAQ
-- =====================================================================
insert into public.faq_entries (question, answer, sort_order)
select * from (values
  ('Do I need my own API keys to start?',
   $t$No. Signing up grants credits that run on the studio account, so your first generation costs nothing and needs no setup. Connecting your own Hugging Face, fal.ai or Replicate key is optional, and after that your generations run on your quota instead of the shared one.$t$, 10),
  ('Which models can I use?',
   $t$Open-weight ones — the FLUX.1 family, Stable Diffusion XL, Wan 2.2, LTX-Video, CogVideoX and HunyuanVideo — served through Hugging Face, fal.ai or Replicate. The model list on this page is read from the same registry the composer uses, so it is never out of date.$t$, 20),
  ('What is a credit worth?',
   $t$A credit is a unit of render cost, and every model shows its price in the composer before you submit. A quick still is a few credits; a ten-second motion pass is more. Jobs that fail refund automatically.$t$, 30),
  ('Is the billing real?',
   $t$No, and the app says so wherever it comes up. Checkout in this build is simulated: no payment provider is connected, no card is charged, and no card details are stored. Plans and credit grants otherwise behave exactly as they would.$t$, 40),
  ('Who owns what I make?',
   $t$You do. Shots stay private until you publish them, downloads are the full-resolution original, and deleting an asset removes it from storage rather than hiding it. The underlying models carry their own licences — all of them open.$t$, 50),
  ('What happens to the images I upload?',
   $t$A reference image is stored in your own private bucket, used as the start frame for the job you submitted, and deletable from the library. It is not used to train anything.$t$, 60)
) as seed(question, answer, sort_order)
where not exists (select 1 from public.faq_entries);

-- =====================================================================
-- NAVIGATION
--
-- The header is five anchors and one route. `is_route` is what tells
-- `resolveMarketingHref` not to rewrite `/explore` into `//explore` when the bar
-- renders on a page that is not the landing page.
-- =====================================================================
insert into public.nav_links (nav_group, label, href, is_route, sort_order)
select * from (values
  ('header', 'Explore',      '/explore',  true,  10),
  ('header', 'Features',     '#overview', false, 20),
  ('header', 'Models',       '#models',   false, 30),
  ('header', 'How it works', '#workflow', false, 40),
  ('header', 'Pricing',      '#pricing',  false, 50),
  ('header', 'FAQ',          '#faq',      false, 60)
) as seed(nav_group, label, href, is_route, sort_order)
where not exists (select 1 from public.nav_links where nav_group = 'header');

insert into public.nav_links (nav_group, label, href, is_route, sort_order)
select * from (values
  ('footer_workspace', 'Dashboard',          '/dashboard',       true, 10),
  ('footer_workspace', 'Composer',           '/create',          true, 20),
  ('footer_workspace', 'Presets',            '/presets',         true, 30),
  ('footer_workspace', 'Explore',            '/explore',         true, 40),
  ('footer_account',   'Sign in',            '/sign-in',         true, 10),
  ('footer_account',   'Create an account',  '/sign-up',         true, 20),
  ('footer_account',   'API keys',           '/settings/keys',   true, 30),
  ('footer_account',   'Billing',            '/settings/billing', true, 40),
  ('footer_note',      'Checkout is simulated',   '', false, 10),
  ('footer_note',      'Every model open-weight', '', false, 20),
  ('footer_note',      'Bring your own API keys', '', false, 30)
) as seed(nav_group, label, href, is_route, sort_order)
where not exists (select 1 from public.nav_links where nav_group like 'footer%');

-- =====================================================================
-- PLANS
--
-- The three tiers exactly as lib/plans.ts declared them. `id` matches the
-- `plan_tier` enum, which is what makes these editable without touching the
-- entitlement path.
-- =====================================================================
insert into public.plans (
  id, name, tagline, price_usd, cadence, billing_period, credits,
  max_concurrent_jobs, max_generations_per_hour, rank, perks,
  cta_label, is_popular, sort_order
)
values
  ('free', 'Free',
   $t$Everything in the studio, on the credits you get at signup.$t$,
   0, 'forever', 'none', 200, 2, 20, 0,
   array[
     '200 credits the moment you sign up',
     'Every model and every preset',
     'Projects, library, history and Explore',
     'Failed jobs refund automatically'
   ],
   'Start creating free', false, 10),

  ('pro', 'Pro',
   $t$For the week where one idea turns into forty takes.$t$,
   24, 'per month', 'monthly', 2500, 5, 60, 1,
   array[
     '2,500 credits every month',
     '5 jobs rendering at once',
     'Bring your own provider keys',
     'Cancel or change plan any time'
   ],
   null, true, 20),

  ('enterprise', 'Enterprise',
   $t$Team-scale throughput, with room for a bad week.$t$,
   79, 'per month', 'monthly', 10000, 12, 240, 2,
   array[
     '10,000 credits every month',
     '12 jobs rendering at once',
     'Priority placement in the queue',
     'Everything in Pro'
   ],
   null, false, 30)
on conflict (id) do nothing;

-- The comparison matrix. A missing plan key renders as a dash, so a row does
-- not have to name every tier to be publishable.
insert into public.plan_features (label, values, sort_order)
select * from (values
  ('Monthly credits',                  '{"free": "200 at signup", "pro": "2,500", "enterprise": "10,000"}'::jsonb, 10),
  ('Concurrent renders',               '{"free": "2", "pro": "5", "enterprise": "12"}'::jsonb,                      20),
  ('Generations per hour',             '{"free": "20", "pro": "60", "enterprise": "240"}'::jsonb,                   30),
  ('Every model and preset',           '{"free": true, "pro": true, "enterprise": true}'::jsonb,                    40),
  ('Projects, library and history',    '{"free": true, "pro": true, "enterprise": true}'::jsonb,                    50),
  ('Publish and remix on Explore',     '{"free": true, "pro": true, "enterprise": true}'::jsonb,                    60),
  ('Bring your own provider keys',     '{"free": false, "pro": true, "enterprise": true}'::jsonb,                   70),
  ('Priority queue placement',         '{"free": false, "pro": false, "enterprise": true}'::jsonb,                  80)
) as seed(label, values, sort_order)
where not exists (select 1 from public.plan_features);

-- =====================================================================
-- CREDIT RULES
--
-- `signup_grant` is the one that is live: `handle_new_user()` awards 200 and
-- the landing page quotes the free plan's `credits`, so all three now read from
-- configuration an operator can change. `referral_bonus` is seeded disabled
-- because there is no referral flow in this build — the row exists so the figure
-- is configured before the feature lands rather than hard-coded into it after.
-- =====================================================================
insert into public.credit_rules (key, label, description, amount, enabled, sort_order)
values
  ('signup_grant',      'Signup grant',
   'Awarded once, by the handle_new_user trigger, the moment an account is created.', 200, true, 10),
  ('monthly_renewal',   'Monthly renewal',
   'The free tier''s allowance on each renewal. Paid plans use their own plan credits instead.', 0, false, 20),
  ('plan_pro',          'Pro plan credits',
   'Reset — not added — on each renewal. Mirrors the Pro plan and is edited there.', 2500, true, 30),
  ('plan_enterprise',   'Enterprise plan credits',
   'Reset — not added — on each renewal. Mirrors the Enterprise plan and is edited there.', 10000, true, 40),
  ('bonus_grant',       'Manual bonus',
   'The default amount the Users screen offers when granting credits by hand.', 100, true, 50),
  ('referral_bonus',    'Referral bonus',
   'Future-ready. No referral flow ships in this build, so nothing awards it yet.', 50, false, 60)
on conflict (key) do nothing;

-- =====================================================================
-- AI PROVIDERS
--
-- Mirrors lib/ai/catalogue.ts row for row, including `generation_ready`: the
-- three aggregators can run a job, the other nine store and verify a key and
-- nothing more.
-- =====================================================================
insert into public.ai_providers (
  id, label, description, media, console_url, docs_url,
  key_placeholder, key_min_length, key_pattern,
  is_recommended, generation_ready, status, sort_order
)
values
  ('huggingface', 'Hugging Face',
   $t$One token serves FLUX.1 and SDXL. A free account is enough to start.$t$,
   'image', 'https://huggingface.co/settings/tokens', 'https://huggingface.co/docs/api-inference',
   'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 20, '^hf_', true, true, 'active', 10),

  ('fal', 'fal.ai',
   $t$Aggregator. One key serves FLUX, Wan, LTX, CogVideoX and Hunyuan.$t$,
   'both', 'https://fal.ai/dashboard/keys', 'https://docs.fal.ai',
   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx', 20, ':', true, true, 'active', 20),

  ('replicate', 'Replicate',
   $t$Aggregator. Hosted versions of most open image and video models.$t$,
   'both', 'https://replicate.com/account/api-tokens', 'https://replicate.com/docs',
   'r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 20, '^r8_', true, true, 'active', 30),

  ('flux', 'Flux · Black Forest Labs',
   $t$The Flux family direct from BFL. Strong prompt adherence, fast drafts.$t$,
   'image', 'https://api.bfl.ai', 'https://docs.bfl.ai',
   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 20, null, false, false, 'beta', 40),

  ('stability', 'Stable Diffusion · Stability AI',
   $t$Stable Diffusion 3.5 and the Stable Image endpoints.$t$,
   'image', 'https://platform.stability.ai/account/keys', 'https://platform.stability.ai/docs/api-reference',
   'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 20, '^sk-', false, false, 'beta', 50),

  ('openai', 'OpenAI Images',
   $t$GPT image generation. Best in the catalogue at text inside an image.$t$,
   'image', 'https://platform.openai.com/api-keys', 'https://platform.openai.com/docs/guides/images',
   'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx', 20, '^sk-', false, false, 'beta', 60),

  ('google', 'Google AI · Imagen & Veo',
   $t$One Gemini API key serves both Imagen stills and Veo video.$t$,
   'both', 'https://aistudio.google.com/apikey', 'https://ai.google.dev/gemini-api/docs',
   'AIzaSy...', 20, null, false, false, 'beta', 70),

  ('kling', 'Kling AI',
   $t$Kuaishou’s video model. Holds a character through a camera move.$t$,
   'video', 'https://app.klingai.com', 'https://app.klingai.com/global/dev/document-api',
   'accessKey:secretKey', 16, ':', false, false, 'beta', 80),

  ('runway', 'Runway',
   $t$Gen-4. The reliable one for image-to-video with a start frame.$t$,
   'video', 'https://dev.runwayml.com', 'https://docs.dev.runwayml.com',
   'key_xxxxxxxxxxxxxxxxxxxxxxxx', 20, null, false, false, 'beta', 90),

  ('luma', 'Luma Dream Machine',
   $t$Ray. Natural motion and camera language from a single still.$t$,
   'video', 'https://lumalabs.ai/api/keys', 'https://docs.lumalabs.ai',
   'luma-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 20, null, false, false, 'beta', 100),

  ('pika', 'Pika',
   $t$Stylised short-form motion and the effects presets Pika is known for.$t$,
   'video', 'https://pika.art', 'https://pika.art', 'pk-xxxxxxxxxxxxxxxxxxxxxxxx', 16, null,
   false, false, 'beta', 110)
on conflict (id) do nothing;

-- =====================================================================
-- AI MODELS
--
-- Presentation metadata for the ten registry entries. `provider_id` is the
-- model's FIRST route — the one the router tries first and therefore the one
-- the badge should name — so the card and the account that gets billed agree.
--
-- The six that carried marketing copy in lib/marketing/landing.ts keep it and
-- show on the landing page; the other four are listed in the model library, which
-- reads the whole registry, and are not separately featured.
-- =====================================================================
insert into public.ai_models (
  id, label, provider_id, description, basis, use_case, category, tags,
  capabilities, input_types, output_types,
  is_recommended, is_featured, show_on_landing, status, sort_order
)
values
  ('lumen-flash', 'Lumen Flash', 'huggingface',
   $t$Four steps and Apache-2.0. Fast enough to iterate on a look before you commit a credit to the finished frame.$t$,
   'FLUX.1 [schnell]', 'Drafts and start frames', 'image',
   array['fast', 'apache-2.0', 'flux'], array['text_to_image'], array['text'], array['image'],
   true, true, true, 'active', 10),

  ('lumen-pro', 'Lumen Pro', 'fal',
   $t$Photoreal detail and composition that holds together. The default when the frame is the deliverable.$t$,
   'FLUX.1 [dev]', 'Finished stills', 'image',
   array['photoreal', 'flux'], array['text_to_image', 'negative_prompt'], array['text'], array['image'],
   true, true, true, 'active', 20),

  ('lumen-portrait', 'Lumen Portrait', 'fal',
   $t$FLUX.1 [dev], tuned for faces, skin and editorial lighting.$t$,
   'FLUX.1 [dev]', 'Portraits', 'image',
   array['portrait', 'flux'], array['text_to_image', 'negative_prompt'], array['text'], array['image'],
   false, false, true, 'active', 30),

  ('lumen-sdxl', 'Lumen SDXL', 'fal',
   $t$The open workhorse. Broad style range and the cheapest pass in the catalogue.$t$,
   'Stable Diffusion XL', 'Style exploration', 'image',
   array['sdxl', 'cheap'], array['text_to_image', 'negative_prompt'], array['text'], array['image'],
   false, true, true, 'active', 40),

  ('motion-turbo', 'Motion Turbo', 'fal',
   $t$Quick motion passes while you dial in a camera move, before you pay for the long one.$t$,
   'Wan 2.2 turbo', 'Image to video', 'video',
   array['fast', 'wan'], array['image_to_video', 'negative_prompt'], array['text', 'image'], array['video'],
   true, true, true, 'active', 50),

  ('motion-cine', 'Motion Cine', 'fal',
   $t$Holds a face, an outfit and a lighting setup through an entire camera move — continuity over speed.$t$,
   'Wan 2.2 A14B', 'Character-led shots', 'video',
   array['cinematic', 'wan'], array['image_to_video', 'negative_prompt'], array['text', 'image'], array['video'],
   true, true, true, 'active', 60),

  ('motion-scene', 'Motion Scene', 'fal',
   $t$Straight from a sentence to a moving shot, with no start frame and no storyboard.$t$,
   'Wan 2.2 text-to-video', 'Text to video', 'video',
   array['wan'], array['text_to_video', 'negative_prompt'], array['text'], array['video'],
   true, true, true, 'active', 70),

  ('motion-ltx', 'Motion LTX', 'fal',
   $t$LTX-Video 13B distilled. The cheapest way to see an idea move.$t$,
   'LTX-Video 13B (distilled)', 'Cheap motion tests', 'video',
   array['cheap', 'ltx'], array['text_to_video', 'negative_prompt'], array['text'], array['video'],
   false, false, true, 'active', 80),

  ('motion-cog', 'Motion Cog', 'fal',
   $t$CogVideoX-5B. Steady six-second shots with unusually clean motion.$t$,
   'CogVideoX-5B', 'Six-second shots', 'video',
   array['cogvideox'], array['text_to_video', 'negative_prompt'], array['text'], array['video'],
   false, false, true, 'active', 90),

  ('motion-hunyuan', 'Motion Hunyuan', 'fal',
   $t$HunyuanVideo. The largest open video model here — slow, worth it.$t$,
   'HunyuanVideo', 'Maximum fidelity', 'video',
   array['hunyuan'], array['text_to_video', 'negative_prompt'], array['text'], array['video'],
   false, false, true, 'active', 100)
on conflict (id) do nothing;

-- =====================================================================
-- CATEGORIES
--
-- 'explore' mirrors the `generations_categories_allowed` check constraint as
-- rewritten by 0014. It is metadata: a row here cannot widen what a shot may be
-- tagged with, and the admin form says so.
-- =====================================================================
insert into public.content_categories (scope, slug, label, description, sort_order)
values
  ('explore', 'portraits',   'Portraits',    'People, faces and character work.',                   10),
  ('explore', 'anime',       'Anime',        'Illustrated and animation-styled work.',              20),
  ('explore', 'cinematic',   'Cinematic',    'Film-grade lighting and camera language.',            30),
  ('explore', 'product',     'Product',      'Objects, packaging and commercial stills.',           40),
  ('explore', 'landscape',   'Landscape',    'Environments, terrain and weather.',                  50),
  ('explore', 'architecture','Architecture', 'Buildings, interiors and structure.',                  60),
  ('explore', 'abstract',    'Abstract',     'Texture, form and non-representational work.',        70),
  ('explore', 'motion',      'Motion',       'Shots where the camera move is the point.',           80)
on conflict (scope, slug) do nothing;

-- 'preset' is seeded from the live catalogue rather than a literal list, so the
-- categories an operator can edit are exactly the ones presets actually use.
insert into public.content_categories (scope, slug, label, sort_order)
select
  'preset',
  regexp_replace(lower(p.category), '[^a-z0-9]+', '-', 'g'),
  p.category,
  row_number() over (order by p.category) * 10
from (select distinct category from public.presets where is_active) as p
on conflict (scope, slug) do nothing;
