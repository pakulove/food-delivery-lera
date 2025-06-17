create table public.categories (
  id serial not null,
  name text null,
  displayorder integer null,
  constraint categories_pkey primary key (id)
) TABLESPACE pg_default;

-- Reset categories sequence
SELECT setval('categories_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM categories), false);

create table public.products (
  id serial not null,
  name text not null,
  description text null,
  weight text null,
  calories integer null,
  price integer not null,
  proteins integer null,
  isactive boolean null,
  image text null,
  categoryid integer null,
  composition text null,
  constraint products_pkey primary key (id),
  constraint products_categoryid_fkey foreign KEY (categoryid) references categories (id)
) TABLESPACE pg_default;

-- Reset products sequence
SELECT setval('products_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM products), false);

create table public.users (
  id serial not null,
  username text not null,
  password text not null,
  email text null,
  address text null,
  phone text null,
  discount double precision not null default '0'::double precision,
  constraint users_pkey primary key (id),
  constraint users_username_key unique (username)
) TABLESPACE pg_default;

-- Reset users sequence
SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM users), false);

create table public.cart (
  id serial not null,
  userid integer not null,
  productid integer not null,
  customization text null,
  constraint cart_pkey primary key (id),
  constraint cart_productid_fkey foreign KEY (productid) references products (id),
  constraint cart_userid_fkey foreign KEY (userid) references users (id)
) TABLESPACE pg_default;

-- Reset cart sequence
SELECT setval('cart_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM cart), false);

create table public.orders (
  id serial not null,
  userid integer not null,
  orderdate timestamp without time zone not null default CURRENT_TIMESTAMP,
  totalamount integer not null,
  status text null,
  deliveryaddress text null,
  comments text null,
  customization text null,
  constraint orders_pkey primary key (id),
  constraint orders_userid_fkey foreign KEY (userid) references users (id)
) TABLESPACE pg_default;

-- Reset orders sequence
SELECT setval('orders_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM orders), false);

create table public.order_items (
  id serial not null,
  orderid integer not null,
  productid integer not null,
  price integer not null,
  customization text null,
  constraint order_items_pkey primary key (id),
  constraint order_items_orderid_fkey foreign KEY (orderid) references orders (id),
  constraint order_items_productid_fkey foreign KEY (productid) references products (id)
) TABLESPACE pg_default;

-- Reset order_items sequence
SELECT setval('order_items_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM order_items), false);
