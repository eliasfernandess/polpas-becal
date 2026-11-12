begin;
set local role anon;
do $$
declare order_id uuid := gen_random_uuid();
begin
  if (select count(*) from public.products) <> 10 then raise exception 'Unexpected initial catalog'; end if;
  insert into public.orders (id,items,total_in_cents) values (order_id,'[{"id":"morango","quantity":2}]',980);
  begin
    insert into public.orders (id,items,total_in_cents) values (order_id,'[{"id":"morango","quantity":2}]',980);
    raise exception 'Duplicate request accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.orders (id,items,total_in_cents) values (gen_random_uuid(),'[{"id":"morango","quantity":2}]',1);
    raise exception 'Tampered price accepted';
  exception when check_violation then null; end;
  begin
    insert into public.orders (id,items,total_in_cents) values (gen_random_uuid(),'[{"id":"tamarindo","quantity":1}]',450);
    raise exception 'Unavailable product accepted';
  exception when check_violation then null; end;
  begin
    insert into public.orders (id,items,total_in_cents,status) values (gen_random_uuid(),'[{"id":"morango","quantity":1}]',490,'confirmed');
    raise exception 'Client changed status';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.orders; raise exception 'Orders are readable';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.event_requests; raise exception 'Event requests are readable';
  exception when insufficient_privilege then null; end;
  begin update public.products set price_in_cents=1; raise exception 'Catalog is writable';
  exception when insufficient_privilege then null; end;
  insert into public.event_requests (id,name,event_type,event_date,guests,location) values
    (gen_random_uuid(),'Teste transacional','Casamento','2099-12-20','Até 50','Local de teste');
  begin
    insert into public.event_requests (id,name,event_type,event_date,guests,location) values
      (gen_random_uuid(),'Teste transacional','Casamento','2020-01-01','Até 50','Local de teste');
    raise exception 'Past event accepted';
  exception when check_violation then null; end;
end;
$$;
reset role;
rollback;
select 'Catalog, inserts, price validation, idempotency and access controls verified; transaction rolled back' as result;
