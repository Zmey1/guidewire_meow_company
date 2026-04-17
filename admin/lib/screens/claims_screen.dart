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
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _fetch() async {
    try {
      final path = _filterStatus == 'all'
          ? '/admin/claims'
          : '/admin/claims?status=$_filterStatus';
      final data = await ApiService.get(path);
      if (mounted) {
        setState(() {
          _claims = List<Map<String, dynamic>>.from(data['claims'] ?? []);
          _loading = false;
        });
      }
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
        title: Text('Override Claim',
            style: GoogleFonts.inter(
                color: Colors.white, fontWeight: FontWeight.w600)),
        content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                  'Rider: ${claim['worker_name']} | Type: ${claim['trigger_type']}',
                  style: GoogleFonts.inter(
                      color: const Color(0xFF94A3B8), fontSize: 13)),
              const SizedBox(height: 16),
              Text('Override reason:',
                  style: GoogleFonts.inter(
                      color: const Color(0xFF94A3B8), fontSize: 13)),
              const SizedBox(height: 8),
              TextField(
                controller: ctrl,
                style: GoogleFonts.inter(color: Colors.white),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: const Color(0xFF0F172A),
                  hintText: 'e.g. Verified by field supervisor',
                  hintStyle: GoogleFonts.inter(color: const Color(0xFF475569)),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none),
                ),
              ),
            ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('Cancel',
                  style: GoogleFonts.inter(color: const Color(0xFF94A3B8)))),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF10B981)),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Approve & Credit',
                style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );

    if (confirmed == true && ctrl.text.isNotEmpty) {
      await ApiService.post(
          '/admin/claims/${claim['id']}/override', {'reason': ctrl.text});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          backgroundColor: const Color(0xFF10B981),
          content: Text('Claim overridden — wallet credited',
              style: GoogleFonts.inter()),
        ));
      }
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

  void _showClaimDetails(Map<String, dynamic> c) {
    final fr = c['fraud_result'] as Map<String, dynamic>?;
    final ring = fr?['ring_detected'] as String?;
    final anomaly = (fr?['graph_anomaly_score'] as num?)?.toDouble() ?? 0.0;
    final trust = (fr?['trust_score_at_check'] as num?)?.toDouble() ?? 1.0;
    final status = c['status'] as String? ?? '';

    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        child: Container(
          width: 420,
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF334155)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                decoration: const BoxDecoration(
                  color: Color(0xFF0F172A),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.receipt_long_rounded,
                        color: Color(0xFF6366F1), size: 20),
                    const SizedBox(width: 10),
                    Text('Claim Details',
                        style: GoogleFonts.inter(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16)),
                    const Spacer(),
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: const Icon(Icons.close_rounded,
                          color: Color(0xFF64748B), size: 20),
                    ),
                  ],
                ),
              ),

              // Body
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _detailRow(Icons.person_outline_rounded, 'Rider',
                        c['worker_name'] ?? '—', Colors.white),
                    _detailRow(Icons.location_on_outlined, 'Zone',
                        c['zone_id'] ?? '—', const Color(0xFF94A3B8)),
                    _detailRow(Icons.bolt_outlined, 'Trigger',
                        c['trigger_type'] ?? '—', const Color(0xFF94A3B8)),
                    _detailRow(Icons.currency_rupee_rounded, 'Payout',
                        '₹${c['payout_amount'] ?? 0}', const Color(0xFF10B981)),
                    _detailRow(Icons.flag_outlined, 'Status', status,
                        _statusColor(status)),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Divider(color: Color(0xFF334155)),
                    ),
                    Text('Fraud Analysis',
                        style: GoogleFonts.inter(
                            color: const Color(0xFF64748B),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.1)),
                    const SizedBox(height: 12),
                    if (ring != null)
                      _detailRow(Icons.hub_outlined, 'Ring Detected', ring,
                          _ringColor(ring)),
                    _scoreRow(
                        'Anomaly Score',
                        anomaly,
                        anomaly > 0.6
                            ? const Color(0xFFEF4444)
                            : const Color(0xFFF59E0B)),
                    _scoreRow(
                        'Trust Score',
                        trust,
                        trust < 0.4
                            ? const Color(0xFFEF4444)
                            : const Color(0xFF10B981)),
                  ],
                ),
              ),

              // Actions
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (status == 'rejected')
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF6366F1),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10))),
                        icon: const Icon(Icons.edit_outlined, size: 16),
                        label: Text('Override',
                            style: GoogleFonts.inter(
                                fontWeight: FontWeight.w600, fontSize: 13)),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _override(c);
                        },
                      ),
                    if (status == 'rejected') const SizedBox(width: 8),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Color(0xFF334155)),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () => Navigator.pop(ctx),
                      child: Text('Close',
                          style: GoogleFonts.inter(
                              color: const Color(0xFF94A3B8), fontSize: 13)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _detailRow(
      IconData icon, String label, String value, Color valueColor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 15, color: const Color(0xFF475569)),
          const SizedBox(width: 10),
          SizedBox(
            width: 90,
            child: Text(label,
                style: GoogleFonts.inter(
                    color: const Color(0xFF64748B), fontSize: 13)),
          ),
          Expanded(
            child: Text(value,
                style: GoogleFonts.inter(
                    color: valueColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w500),
                overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }

  Widget _scoreRow(String label, double value, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style: GoogleFonts.inter(
                      color: const Color(0xFF64748B), fontSize: 12)),
              Text(value.toStringAsFixed(2),
                  style: GoogleFonts.inter(
                      color: color, fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: value.clamp(0.0, 1.0),
              minHeight: 5,
              backgroundColor: const Color(0xFF0F172A),
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Claims',
              style: GoogleFonts.inter(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: Colors.white)),
          Text('Fraud visibility + admin override',
              style: GoogleFonts.inter(color: const Color(0xFF94A3B8))),
          const SizedBox(height: 24),

          // Filter bar
          Row(children: [
            for (final s in [
              'all',
              'approved',
              'rejected',
              'pending_verification'
            ])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(s, style: GoogleFonts.inter(fontSize: 13)),
                  selected: _filterStatus == s,
                  onSelected: (_) {
                    setState(() {
                      _filterStatus = s;
                      _loading = true;
                    });
                    _fetch();
                  },
                  selectedColor: const Color(0xFF6366F1),
                  backgroundColor: const Color(0xFF1E293B),
                  labelStyle: GoogleFonts.inter(
                      color: _filterStatus == s
                          ? Colors.white
                          : const Color(0xFF94A3B8)),
                ),
              ),
            const Spacer(),
            IconButton(
                icon: const Icon(Icons.refresh, color: Color(0xFF64748B)),
                onPressed: _fetch),
          ]),
          const SizedBox(height: 16),

          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_claims.isEmpty)
            Expanded(
                child: Center(
                    child: Text('No claims found.',
                        style:
                            GoogleFonts.inter(color: const Color(0xFF64748B)))))
          else
            Expanded(
              child: Column(
                children: [
                  // 3-Column Table Header
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 12),
                    decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(12)),
                    child: Row(children: [
                      Expanded(
                          flex: 3,
                          child: Text('Name',
                              style: GoogleFonts.inter(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: const Color(0xFF64748B)))),
                      Expanded(
                          flex: 2,
                          child: Text('Zone',
                              style: GoogleFonts.inter(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: const Color(0xFF64748B)))),
                      Expanded(
                          flex: 2,
                          child: Text('Status',
                              style: GoogleFonts.inter(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: const Color(0xFF64748B)))),
                    ]),
                  ),
                  const SizedBox(height: 6),

                  // Table Rows
                  Expanded(
                    child: ListView.builder(
                      itemCount: _claims.length,
                      itemBuilder: (context, index) {
                        final c = _claims[index];
                        final status = c['status'] as String? ?? '';

                        return GestureDetector(
                          onTap: () => _showClaimDetails(c),
                          child: MouseRegion(
                            cursor: SystemMouseCursors.click,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 4),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 20, vertical: 14),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1E293B),
                                borderRadius: BorderRadius.circular(12),
                                border:
                                    Border.all(color: const Color(0xFF334155)),
                              ),
                              child: Row(children: [
                                // Name Column
                                Expanded(
                                  flex: 3,
                                  child: Row(
                                    children: [
                                      CircleAvatar(
                                        radius: 14,
                                        backgroundColor: const Color(0xFF6366F1)
                                            .withValues(alpha: 0.2),
                                        child: Text(
                                          (c['worker_name']
                                                      ?.toString()
                                                      .isNotEmpty ==
                                                  true)
                                              ? c['worker_name']
                                                  .toString()[0]
                                                  .toUpperCase()
                                              : '?',
                                          style: GoogleFonts.inter(
                                              color: const Color(0xFF6366F1),
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          c['worker_name'] ?? '—',
                                          style: GoogleFonts.inter(
                                              color: Colors.white,
                                              fontSize: 13,
                                              fontWeight: FontWeight.w500),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                // Zone Column
                                Expanded(
                                  flex: 2,
                                  child: Text(
                                    c['zone_id'] ?? '—',
                                    style: GoogleFonts.inter(
                                        color: const Color(0xFF94A3B8),
                                        fontSize: 13),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                // Status Column
                                Expanded(
                                  flex: 2,
                                  child: Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: _statusColor(status)
                                              .withValues(alpha: 0.15),
                                          borderRadius:
                                              BorderRadius.circular(20),
                                        ),
                                        child: Text(
                                          status,
                                          style: GoogleFonts.inter(
                                              color: _statusColor(status),
                                              fontSize: 11,
                                              fontWeight: FontWeight.w500),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ]),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
        ]),
      ),
    );
  }
}
