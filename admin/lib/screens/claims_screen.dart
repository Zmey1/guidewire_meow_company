import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:async';
import '../services/api_service.dart';

class ClaimsScreen extends StatefulWidget {
  const ClaimsScreen({super.key});
  @override
  State<ClaimsScreen> createState() => _ClaimsScreenState();
}

class _ClaimsScreenState extends State<ClaimsScreen> {
  List<Map<String, dynamic>> _claims = [];
  bool _loading = true;
  String _filterStatus = 'all';
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _fetch();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _fetch());
  }

  @override
  void dispose() { _timer?.cancel(); super.dispose(); }

  Future<void> _fetch() async {
    try {
      final path = _filterStatus == 'all' ? '/admin/claims' : '/admin/claims?status=$_filterStatus';
      final data = await ApiService.get(path);
      if (mounted) setState(() { _claims = List<Map<String, dynamic>>.from(data['claims'] ?? []); _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _override(Map<String, dynamic> claim) async {
    final ctrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Override Claim', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Rider: ${claim['worker_name']} | Type: ${claim['trigger_type']}', style: GoogleFonts.inter(color: const Color(0xFF94A3B8), fontSize: 13)),
          const SizedBox(height: 16),
          Text('Override reason:', style: GoogleFonts.inter(color: const Color(0xFF94A3B8), fontSize: 13)),
          const SizedBox(height: 8),
          TextField(
            controller: ctrl,
            style: GoogleFonts.inter(color: Colors.white),
            decoration: InputDecoration(
              filled: true, fillColor: const Color(0xFF0F172A),
              hintText: 'e.g. Verified by field supervisor',
              hintStyle: GoogleFonts.inter(color: const Color(0xFF475569)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
            ),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Cancel', style: GoogleFonts.inter(color: const Color(0xFF94A3B8)))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Approve & Credit', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );

    if (confirmed == true && ctrl.text.isNotEmpty) {
      await ApiService.post('/admin/claims/${claim['id']}/override', {'reason': ctrl.text});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        backgroundColor: const Color(0xFF10B981),
        content: Text('Claim overridden — wallet credited', style: GoogleFonts.inter()),
      ));
      _fetch();
    }
  }

  Color _statusColor(String? s) {
    if (s == 'approved') return const Color(0xFF10B981);
    if (s == 'rejected') return const Color(0xFFEF4444);
    return const Color(0xFFF59E0B);
  }

  Color _ringColor(String? r) {
    if (r == 'hard') return const Color(0xFFEF4444);
    if (r == 'soft') return const Color(0xFFF59E0B);
    return const Color(0xFF64748B);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Claims', style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w700, color: Colors.white)),
          Text('Fraud visibility + admin override', style: GoogleFonts.inter(color: const Color(0xFF94A3B8))),
          const SizedBox(height: 24),
          // Filter bar
          Row(children: [
            for (final s in ['all', 'approved', 'rejected', 'pending_verification'])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(s, style: GoogleFonts.inter(fontSize: 13)),
                  selected: _filterStatus == s,
                  onSelected: (_) { setState(() { _filterStatus = s; _loading = true; }); _fetch(); },
                  selectedColor: const Color(0xFF6366F1),
                  backgroundColor: const Color(0xFF1E293B),
                  labelStyle: GoogleFonts.inter(color: _filterStatus == s ? Colors.white : const Color(0xFF94A3B8)),
                ),
              ),
            const Spacer(),
            IconButton(icon: const Icon(Icons.refresh, color: Color(0xFF64748B)), onPressed: _fetch),
          ]),
          const SizedBox(height: 16),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_claims.isEmpty)
            Expanded(child: Center(child: Text('No claims found.', style: GoogleFonts.inter(color: const Color(0xFF64748B)))))
          else
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    // Header
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(12)),
                      child: Row(children: [
                        for (final h in ['Rider', 'Zone', 'Trigger', 'Amount', 'Status', 'Ring', 'Anomaly', 'Trust', 'Action'])
                          Expanded(child: Text(h, style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600, color: const Color(0xFF64748B)))),
                      ]),
                    ),
                    const SizedBox(height: 4),
                    ..._claims.map((c) {
                      final fr = c['fraud_result'] as Map<String, dynamic>?;
                      final ring = fr?['ring_detected'] as String?;
                      final anomaly = (fr?['graph_anomaly_score'] as num?)?.toDouble() ?? 0.0;
                      final trust = (fr?['trust_score_at_check'] as num?)?.toDouble() ?? 1.0;
                      final status = c['status'] as String? ?? '';
                      return Container(
                        margin: const EdgeInsets.only(bottom: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF334155)),
                        ),
                        child: Row(children: [
                          Expanded(child: Text(c['worker_name'] ?? '—', style: GoogleFonts.inter(color: Colors.white, fontSize: 13))),
                          Expanded(child: Text(c['zone_id'] ?? '—', style: GoogleFonts.inter(color: const Color(0xFF94A3B8), fontSize: 12))),
                          Expanded(child: Text(c['trigger_type'] ?? '—', style: GoogleFonts.inter(color: Colors.white, fontSize: 12))),
                          Expanded(child: Text('₹${c['payout_amount'] ?? 0}', style: GoogleFonts.inter(color: const Color(0xFF10B981), fontSize: 13, fontWeight: FontWeight.w600))),
                          Expanded(child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(color: _statusColor(status).withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
                            child: Text(status, style: GoogleFonts.inter(color: _statusColor(status), fontSize: 11)),
                          )),
                          Expanded(child: ring == null ? Text('—', style: GoogleFonts.inter(color: const Color(0xFF64748B))) : Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: _ringColor(ring).withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
                            child: Text(ring, style: GoogleFonts.inter(color: _ringColor(ring), fontSize: 11)),
                          )),
                          Expanded(child: Row(children: [
                            Expanded(child: LinearProgressIndicator(value: anomaly, backgroundColor: const Color(0xFF334155), color: anomaly > 0.6 ? const Color(0xFFEF4444) : const Color(0xFFF59E0B))),
                            const SizedBox(width: 6),
                            Text(anomaly.toStringAsFixed(2), style: GoogleFonts.inter(color: const Color(0xFF94A3B8), fontSize: 11)),
                          ])),
                          Expanded(child: Text(trust.toStringAsFixed(2), style: GoogleFonts.inter(color: trust < 0.4 ? const Color(0xFFEF4444) : const Color(0xFF10B981), fontWeight: FontWeight.w600))),
                          Expanded(child: status == 'rejected'
                              ? TextButton(
                                  onPressed: () => _override(c),
                                  style: TextButton.styleFrom(foregroundColor: const Color(0xFF6366F1)),
                                  child: Text('Override', style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600)),
                                )
                              : const SizedBox()),
                        ]),
                      );
                    }),
                  ],
                ),
              ),
            ),
        ]),
      ),
    );
  }
}
