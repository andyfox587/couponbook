-- South Jersey Food Scene DEMO seed (database: vivaspot_demo ONLY).
-- Fictional restaurants + sample coupons/events for prospect evaluation.
-- Fixed ids make it re-runnable: wipes its own rows first, then reinserts.
BEGIN;

DELETE FROM coupon_submission; DELETE FROM coupon_redemption; DELETE FROM coupon;
DELETE FROM event_rsvp; DELETE FROM event; DELETE FROM purchase;
DELETE FROM merchant_membership; DELETE FROM foodie_group_membership;
DELETE FROM coupon_book_price; DELETE FROM merchant; DELETE FROM "user"; DELETE FROM foodie_group;

INSERT INTO foodie_group (id, slug, name, description, location, banner_image_url, billing_model, social_links)
VALUES ('aa000001-0000-4000-8000-000000000001', 'south-jersey', 'South Jersey Food Scene',
  'Deals and events from the restaurants of South Jersey — Cherry Hill, Collingswood, Haddonfield, Medford, Mount Laurel and beyond.',
  'South Jersey, NJ',
  'https://couponbook-images.s3.us-east-1.amazonaws.com/logos/groups/south-jersey/sjfs-logo.png',
  'one_time', '{"facebook": "https://www.facebook.com/groups/383165965792751"}');

INSERT INTO "user" (id, cognito_sub, email, name, role) VALUES
 ('bb000001-0000-4000-8000-000000000001', '344844a8-3091-70b2-39ab-a6acb4954565',   'andy+sjdemo-member@ivalu8.com',   'Taylor the Foodie',   'customer'),
 ('bb000002-0000-4000-8000-000000000002', 'f4c87478-c011-70b7-65e5-55feaedd017a', 'andy+sjdemo-merchant@ivalu8.com', 'Sam the Restaurateur','merchant'),
 ('bb000003-0000-4000-8000-000000000003', '14981448-20a1-70c9-0fc3-e359e6b06e59',    'andy+sjdemo-admin@ivalu8.com',    'Jordan the Organizer','foodie_group_admin');

INSERT INTO coupon_book_price (id, group_id, amount_cents, currency, is_active, created_by_user_id, label, is_default, sort_order, status)
VALUES ('cc000001-0000-4000-8000-000000000001', 'aa000001-0000-4000-8000-000000000001', 1995, 'usd', true,
        'bb000003-0000-4000-8000-000000000003', 'Coupon Book', true, 0, 'active');

INSERT INTO merchant (id, name, owner_id, background_image_url, instagram_url) VALUES
 ('dd000001-0000-4000-8000-000000000001', 'Haddon Tomato Pie Co.',      'bb000002-0000-4000-8000-000000000002', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=70', 'https://instagram.com/haddontomatopie'),
 ('dd000002-0000-4000-8000-000000000002', 'Collingswood Corner Café',   'bb000003-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900&q=70', NULL),
 ('dd000003-0000-4000-8000-000000000003', 'The Cherry Hill Chophouse',  'bb000003-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=900&q=70', NULL),
 ('dd000004-0000-4000-8000-000000000004', 'Medford Mills Bakery',       'bb000003-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=900&q=70', NULL),
 ('dd000005-0000-4000-8000-000000000005', 'Pine Barrens BBQ',           'bb000003-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=70', NULL),
 ('dd000006-0000-4000-8000-000000000006', 'Cooper River Cantina',       'bb000003-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&q=70', NULL),
 ('dd000007-0000-4000-8000-000000000007', 'Shore Points Seafood Shack', 'bb000003-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=900&q=70', NULL);

INSERT INTO foodie_group_membership (id, user_id, group_id, role, joined_at) VALUES
 ('ee000001-0000-4000-8000-000000000001', 'bb000001-0000-4000-8000-000000000001', 'aa000001-0000-4000-8000-000000000001', 'customer', now()),
 ('ee000002-0000-4000-8000-000000000002', 'bb000003-0000-4000-8000-000000000003', 'aa000001-0000-4000-8000-000000000001', 'foodie_group_admin', now());

INSERT INTO merchant_membership (id, merchant_id, user_id) VALUES
 ('ee000003-0000-4000-8000-000000000003', 'dd000001-0000-4000-8000-000000000001', 'bb000002-0000-4000-8000-000000000002');

INSERT INTO purchase (id, user_id, group_id, amount_cents, currency, status, purchased_at, expires_at, provider, metadata)
VALUES ('ff000001-0000-4000-8000-000000000001', 'bb000001-0000-4000-8000-000000000001', 'aa000001-0000-4000-8000-000000000001',
        1995, 'usd', 'paid', now(), now() + interval '1 year', 'admin_grant', '{"createdVia": "sj-demo-seed"}');

INSERT INTO coupon (id, group_id, merchant_id, title, description, coupon_type, discount_value, valid_from, expires_at, qr_code_url, locked, cuisine_type)
SELECT ('a1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'aa000001-0000-4000-8000-000000000001', m::uuid, t, d, ct::coupon_type, dv,
       CURRENT_DATE::timestamp, CURRENT_DATE::timestamp + interval '1 year', '', false, cu
FROM (VALUES
 (1,  'dd000001-0000-4000-8000-000000000001', '10% off any Tomato Pie',                'Our signature square pie, crushed-tomato top, done the South Jersey way.', 'percent', 10.0, 'Italian'),
 (2,  'dd000001-0000-4000-8000-000000000001', 'Free garlic knots with any large pie',  'A half-dozen hand-tied knots on the house with every large pie.', 'free_item', 0, 'Italian'),
 (3,  'dd000002-0000-4000-8000-000000000002', 'Buy one latte, get one free',           'Bring a friend — two handcrafted lattes for the price of one, any day before 11am.', 'bogo', 0, 'Coffee shop'),
 (4,  'dd000002-0000-4000-8000-000000000002', '$2 off any breakfast sandwich',         'Fresh-baked rolls, local eggs, and your choice of pork roll or bacon.', 'amount', 2.0, 'Coffee shop'),
 (5,  'dd000003-0000-4000-8000-000000000003', 'Free appetizer with any entrée',        'Choose any starter on us when you order an entrée. Dine-in only.', 'free_item', 0, 'American'),
 (6,  'dd000003-0000-4000-8000-000000000003', '10% off your dinner bill',              'Good any night of the week, including weekends.', 'percent', 10.0, 'American'),
 (7,  'dd000004-0000-4000-8000-000000000004', 'Free cookie with any purchase',         'One fresh-baked cookie of your choice with anything in the case.', 'free_item', 0, 'Bakery'),
 (8,  'dd000005-0000-4000-8000-000000000005', '$5 off the family platter',             'Brisket, ribs, pulled pork, and two sides — feeds four.', 'amount', 5.0, 'BBQ'),
 (9,  'dd000005-0000-4000-8000-000000000005', 'BOGO pulled pork sandwich',             'Buy one smoked pulled pork sandwich, get the second free.', 'bogo', 0, 'BBQ'),
 (10, 'dd000006-0000-4000-8000-000000000006', 'Kids eat free on Tuesdays',             'One free kids meal per adult entrée, every Tuesday.', 'free_item', 0, 'Mexican'),
 (11, 'dd000006-0000-4000-8000-000000000006', '10% off dinner',                        'Tacos, enchiladas, fajitas — 10% off your whole dinner check.', 'percent', 10.0, 'Mexican'),
 (12, 'dd000007-0000-4000-8000-000000000007', 'Free hushpuppies with any platter',     'A basket of our famous hushpuppies with every seafood platter.', 'free_item', 0, 'Seafood')
) AS v(n, m, t, d, ct, dv, cu);

INSERT INTO event (id, group_id, merchant_id, name, description, start_datetime, end_datetime, location, capacity,
                   cover_image_url, banner_image_url, slug, member_access_token, status, price_cents, members_only_price_cents,
                   is_free, visibility, max_tickets_per_guest, invite_only) VALUES
 ('b2000001-0000-4000-8000-000000000001', 'aa000001-0000-4000-8000-000000000001', 'dd000003-0000-4000-8000-000000000003',
  'South Jersey Restaurant Week Kickoff',
  'Meet the chefs and taste previews from a dozen South Jersey kitchens. Free to attend — RSVP so we can plan portions!',
  now() + interval '21 days', now() + interval '21 days 3 hours', 'Cherry Hill, NJ', 150,
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=70', 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=70',
  'sj-restaurant-week-kickoff', md5('sj-demo-event-1'), 'published', 0, 0, true, 'public', 4, false),
 ('b2000002-0000-4000-8000-000000000002', 'aa000001-0000-4000-8000-000000000001', 'dd000001-0000-4000-8000-000000000001',
  'Tomato Pie Masterclass',
  'Hands-on class with our pizzaiolo: dough, crushed tomatoes, and the upside-down build that makes a true Jersey tomato pie. Members save $5.',
  now() + interval '28 days', now() + interval '28 days 2 hours', 'Haddonfield, NJ', 30,
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=70', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=70',
  'tomato-pie-masterclass', md5('sj-demo-event-2'), 'published', 2500, 2000, false, 'public', 2, false);

INSERT INTO coupon_submission (id, group_id, merchant_id, state, submitted_at, submission_data)
VALUES ('c3000001-0000-4000-8000-000000000001', 'aa000001-0000-4000-8000-000000000001', 'dd000007-0000-4000-8000-000000000007',
        'pending', now(),
        json_build_object('title', '15% off your whole catch', 'description', 'Fifteen percent off everything on the menu, all season.',
          'coupon_type', 'percent', 'discount_value', 15, 'valid_from', CURRENT_DATE::text,
          'expires_at', (CURRENT_DATE + interval '1 year')::date::text, 'qr_code_url', '', 'locked', false,
          'cuisine_type', 'Seafood')::jsonb);

COMMIT;
