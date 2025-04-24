const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { createClient } = require('@supabase/supabase-js');

const fastify = Fastify({ logger: true });
fastify.register(cors);

const supabase = createClient(
  'https://akikonahxqewrqnwknws.supabase.co',
  '***REMOVED***'
);

// Health check
fastify.get('/', async (request, reply) => {
  return { message: 'HRIS server is running 👋' };
});

// GET profile by ID
fastify.get('/profile/:id', async (request, reply) => {
  const id = parseInt(request.params.id);
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data || { message: 'Employee not found' };
});

// PATCH update profile
fastify.patch('/profile/:id', async (request, reply) => {
  const id = parseInt(request.params.id);
  const updates = request.body;
  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data || { message: 'Employee not found or not updated' };
});

// GET contract status
fastify.get('/profile/:id/contract', async (request, reply) => {
  const id = parseInt(request.params.id);
  const { data, error } = await supabase
    .from('employees')
    .select('contract_type, start_date, probation_end, status')
    .eq('id', id)
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data || { message: 'Employee not found' };
});

// GET leave balance
fastify.get('/profile/:id/leave-balance', async (request, reply) => {
  const id = parseInt(request.params.id);
  const { data, error } = await supabase
    .from('employees')
    .select('annual_leave_balance, personal_leave_balance, wellbeing_day_balance')
    .eq('id', id)
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data || { message: 'Leave data not found' };
});

// POST leave request
fastify.post('/leave/apply', async (request, reply) => {
  const { employee_id, leave_type, start_date, end_date } = request.body;
  const { data, error } = await supabase
    .from('leave_requests')
    .insert([{
      employee_id,
      leave_type,
      start_date,
      end_date,
      status: 'pending',
      requested_at: new Date().toISOString()
    }])
    .select()
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data;
});

// GET /payslips/:employee_id
fastify.get('/payslips/:employee_id', async (request, reply) => {
  const employee_id = parseInt(request.params.employee_id);
  const { data, error } = await supabase
    .from('payslips')
    .select('period, file_url')
    .eq('employee_id', employee_id)
    .order('period', { ascending: false });
  if (error) return reply.code(500).send(error);
  return data;
});

// GET /trainings/:employee_id
fastify.get('/trainings/:employee_id', async (request, reply) => {
  const employee_id = parseInt(request.params.employee_id);
  const { data, error } = await supabase
    .from('training_participants')
    .select('training_id, feedback, certificate_url, trainings(title, scheduled_date, mandatory)')
    .eq('employee_id', employee_id);
  if (error) return reply.code(500).send(error);
  return data;
});

// POST /trainings/:employee_id/feedback
fastify.post('/trainings/:employee_id/feedback', async (request, reply) => {
  const employee_id = parseInt(request.params.employee_id);
  const { training_id, feedback } = request.body;

  const { data, error } = await supabase
    .from('training_participants')
    .update({ feedback })
    .eq('employee_id', employee_id)
    .eq('training_id', training_id)
    .select()
    .maybeSingle();

  if (error) return reply.code(500).send(error);
  return data || { message: 'Training feedback not saved' };
});

// Run server
fastify.listen({ port: 3000 }, err => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log('✅ HRIS Fastify server (CSV version) is running on http://localhost:3000');
});