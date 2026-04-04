import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../main_tabs.dart';

class PolicyScreen extends StatefulWidget {
  const PolicyScreen({super.key});
  @override
  State<PolicyScreen> createState() => _PolicyScreenState();
}

class _PolicyScreenState extends State<PolicyScreen> {
  Map<String, dynamic>? _policy;
  Map<String, dynamic>? _worker;
  bool _loading = true;

  @override
  void initState() { super.initState(); _fetch(); }

  Future<void> _fetch() async {
    try {
      final res = await Future.wait([
        ApiService.get('/policies/current'),
        ApiService.get('/workers/me'),
      ]);
      if (mounted) setState(() { _policy = res[0]['policy']; _worker = res[1]; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(title: const Text('Coverage')),
      body: _policy == null
          ? ((_worker?['total_deliveries'] ?? 0) < 7)
              ? _IneligibleView(deliveries: _worker?['total_deliveries'] ?? 0)
              : _PurchaseFlow(onSuccess: _fetch)
          : _ActivePolicy(policy: _policy!),
    );
  }
}

// ── Active Policy View ──────────────────────────────────────────────────

class _ActivePolicy extends StatelessWidget {
  final Map<String, dynamic> policy;
  const _ActivePolicy({required this.policy});

  @override
  Widget build(BuildContext context) {
    final cap = policy['effective_weekly_cap'] ?? policy['weekly_cap'] ?? 0;
    final used = policy['payouts_issued_this_week'] ?? 0;
    final remaining = (cap - used).clamp(0, cap);

    return ListView(padding: const EdgeInsets.all(24), children: [
      Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(20)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: AppTheme.primary.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)), child: Text('ACTIVE', style: GoogleFonts.inter(color: AppTheme.primary, fontSize: 11, fontWeight: FontWeight.w600))),
            const Spacer(),
            Text('COVERED', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 24),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            _stat('Weekly Cap', '₹$cap'),
            _stat('Used', '₹$used'),
            _stat('Remaining', '₹$remaining'),
          ]),
          const SizedBox(height: 16),
          ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: cap > 0 ? used / cap : 0, backgroundColor: AppTheme.surfaceVariant, color: AppTheme.secondary, minHeight: 8)),
        ]),
      ),
      const SizedBox(height: 24),
      Text('Declared Shifts', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
      const SizedBox(height: 12),
      ...(policy['shift_slots'] as List? ?? []).map((s) => Container(
        margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          SizedBox(width: 50, child: Text((s['day'] as String).toUpperCase(), style: GoogleFonts.inter(color: AppTheme.textSecondary, fontWeight: FontWeight.w600))),
          const SizedBox(width: 16),
          Text('${s['start']} - ${s['end']}', style: GoogleFonts.inter(color: Colors.white)),
        ]),
      )),
    ]);
  }

  Widget _stat(String l, String v) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(l, style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 12)),
    const SizedBox(height: 4),
    Text(v, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 18)),
  ]);
}

// ── Purchase Flow ───────────────────────────────────────────────────────

class _PurchaseFlow extends StatefulWidget {
  final VoidCallback onSuccess;
  const _PurchaseFlow({required this.onSuccess});
  @override
  State<_PurchaseFlow> createState() => _PurchaseFlowState();
}

class _PurchaseFlowState extends State<_PurchaseFlow> {
  Map<String, dynamic>? _quote;
  bool _calculating = true;
  bool _purchasing = false;

  final Map<String, Map<String, String>> _shifts = {
    'mon': {'start': '17:00', 'end': '23:00'},
    'tue': {'start': '17:00', 'end': '23:00'},
    'wed': {'start': '17:00', 'end': '23:00'},
    'thu': {'start': '17:00', 'end': '23:00'},
    'fri': {'start': '17:00', 'end': '23:00'},
    'sat': {'start': '12:00', 'end': '22:00'},
    'sun': {'start': '12:00', 'end': '22:00'},
  };

  @override
  void initState() { super.initState(); _getQuote(); }

  Future<void> _getQuote() async {
    setState(() => _calculating = true);
    try {
      final res = await ApiService.get('/policies/premium');
      if (mounted) setState(() { _quote = res; _calculating = false; });
    } catch (_) { if (mounted) setState(() => _calculating = false); }
  }

  Future<void> _purchase() async {
    setState(() => _purchasing = true);
    try {
      final slots = _shifts.entries.map((e) => {'day': e.key, ...e.value}).toList();
      await ApiService.post('/policies/purchase', {
        'shift_slots': slots,
        'premium_paid': _quote?['final_premium'] ?? 0,
      });
      widget.onSuccess();
    } catch (e) {
      if (mounted) {
        setState(() => _purchasing = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.error));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final workerTier = (_quote?['worker_tier'] as String? ?? 'REGULAR').toUpperCase().replaceAll('_', ' ');
    final effectiveCap = _quote?['effective_weekly_cap'] ?? 0;

    return ListView(children: [
      Padding(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Your Protection', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppTheme.primary.withValues(alpha: 0.3)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: AppTheme.secondary.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
                  child: Text(workerTier, style: GoogleFonts.inter(color: AppTheme.secondary, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
                const Spacer(),
                const Icon(Icons.shield_rounded, color: AppTheme.primary, size: 24),
              ]),
              const SizedBox(height: 16),
              Text('ShiftSure Coverage', style: GoogleFonts.inter(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('Weekly payout cap: ₹$effectiveCap', style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 14)),
              const SizedBox(height: 16),
              Text('Actuarially priced based on real-time disruption risk in your zone.', style: GoogleFonts.inter(color: Colors.white70, fontSize: 13, height: 1.4)),
            ]),
          ),
        ]),
      ),
      Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.vertical(top: Radius.circular(32))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('Premium Breakdown', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
            const Spacer(),
            if (_calculating) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
          ]),
          const SizedBox(height: 20),
          _row('Base Risk Premium', '₹${_quote?['base_risk_premium'] ?? '...'}'),
          const SizedBox(height: 10),
          _row('City Multiplier', 'x${_quote?['city_factor'] ?? '...'}', color: AppTheme.error),
          const SizedBox(height: 10),
          _row('Pool Rebate', '-₹${_quote?['rebate'] ?? '...'}', color: AppTheme.success),
          const Divider(color: AppTheme.surfaceVariant, height: 32),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('Final Premium', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
            Text('₹${_quote?['final_premium'] ?? '...'}', style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w800, color: AppTheme.primary)),
          ]),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 18), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
              onPressed: _calculating || _purchasing ? null : _purchase,
              child: _purchasing 
                ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3, color: Colors.white)) 
                : Text('Confirm & Pay', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(height: 12),
        ]),
      ),
    ]);
  }

  Widget _row(String label, String val, {Color? color}) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 14)),
      Text(val, style: GoogleFonts.inter(color: color ?? Colors.white, fontWeight: FontWeight.w600, fontSize: 15)),
    ],
  );
}

class _IneligibleView extends StatelessWidget {
  final int deliveries;
  const _IneligibleView({required this.deliveries});
  @override
  Widget build(BuildContext context) {
    return Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.lock_outline_rounded, size: 64, color: AppTheme.textSecondary),
      const SizedBox(height: 24),
      Text('Coverage Locked', style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white)),
      const SizedBox(height: 12),
      Text('You need 7 deliveries to be eligible for ShiftSure coverage. You currently have $deliveries deliveries.', textAlign: TextAlign.center, style: GoogleFonts.inter(color: AppTheme.textSecondary, height: 1.5)),
    ])));
  }
}

class _PlanCard extends StatelessWidget {
  final String title, desc;
  final bool active;
  final VoidCallback onTap;
  const _PlanCard({required this.title, required this.desc, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: active ? AppTheme.primary.withValues(alpha: 0.15) : AppTheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: active ? AppTheme.primary : AppTheme.surfaceVariant),
        ),
        child: Row(children: [
          Container(width: 18, height: 18, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: active ? AppTheme.primary : AppTheme.textSecondary, width: 2)), child: active ? Center(child: Container(width: 10, height: 10, decoration: const BoxDecoration(color: AppTheme.primary, shape: BoxShape.circle))) : null),
          const SizedBox(width: 16),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 16)),
            Text(desc, style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 13)),
          ]),
        ]),
      ),
    );
  }
}
