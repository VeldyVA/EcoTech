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
    .select('*')
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
    .select('*')
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

// POST /remote-request
fastify.post('/remote-request', async (request, reply) => {
  const { employee_id, work_mode, reason } = request.body;
  const { data, error } = await supabase
    .from('remote_requests')
    .insert([{ employee_id, work_mode, reason, requested_at: new Date().toISOString(), status: 'pending' }])
    .select()
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data;
});

// 1. GET Performance Review & Development Plan by Employee ID
fastify.get('/performance-review/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('performance_review')
    .select('result, period, year, detail, development_plan')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 2. GET KPI by Employee ID
fastify.get('/kpi/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('kpi')
    .select('kpi')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 3. GET Reward Record by Employee ID
fastify.get('/reward/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('reward')
    .select('reward')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 4. GET Disciplinary Record by Employee ID
fastify.get('/disciplinary/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('disciplinary')
    .select('disciplinary, outcome_letter')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 5. GET Grievance Record by Employee ID
fastify.get('/grievance/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('grievance')
    .select('grievance, follow_up, document')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 6. GET Incident Report by Employee ID
fastify.get('/incident/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('incident')
    .select('incident, follow_up, document')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 7. GET Timesheet by Employee ID
fastify.get('/timesheet/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('timesheet')
    .select('timesheet')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 8. GET Overtime Record by Employee ID
fastify.get('/overtime/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('overtime')
    .select('ot_record')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 9. GET Clearance Record by Employee ID
fastify.get('/clearance/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('clearance')
    .select('resignation_date, last_day, exit_interview, final_pay, revoke_it_access,collect_returned_assets, insurance_termination, related_document')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 10. GET Onboarding Record by Employee ID
fastify.get('/onboarding/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('onboarding')
    .select('pre_day_one, day_one, week_one, first_month, day_30, related_document')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 11. GET Employee Transfer by Employee ID
fastify.get('/transfer/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('transfer')
    .select('last_position, last_position_period, new_position, start_date_of_new_position')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 12. GET Work Mode Status by Employee ID
fastify.get('/workmode/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('work_mode')
    .select('work_mode')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 13. GET Remote Request by Employee ID
fastify.get('/remote-request/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('remote_request')
    .select('work_mode, reason')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 14. GET Remote Checklist by Employee ID
fastify.get('/remote-checklist/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('remote_checklist')
    .select('work_mode, approval, internet, vpn_access, company_devices, work_schedule')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

fastify.listen({ port: 3000 }, err => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log('✅ HRIS Fastify server (CSV version) is running on http://localhost:3000');
});
