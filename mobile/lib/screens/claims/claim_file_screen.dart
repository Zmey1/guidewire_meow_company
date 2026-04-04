import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

class ClaimFileScreen extends StatefulWidget {
  final VoidCallback onSuccess;
  const ClaimFileScreen({super.key, required this.onSuccess});
  @override
  State<ClaimFileScreen> createState() => _ClaimFileScreenState();
}

class _ClaimFileScreenState extends State<ClaimFileScreen> {
  final _pageCtrl = PageController();
  int _step = 0;
  String? _triggerType;
  bool _loading = false;
  String? _error;

  final List<Map<String, dynamic>> _triggers = [
    {'id': 'heavy_rain', 'icon': '🌧', 'label': 'Heavy Rain', 'desc': 'Unexpected downpour >10mm/hr'},
    {'id': 'extreme_heat', 'icon': '☀️', 'label': 'Extreme Heat', 'desc': 'Heat index >40°C'},
    {'id': 'flood', 'icon': '🌊', 'label': 'Flood/Waterlogging', 'desc': 'Roads closed due to monsoon'},
    {'id': 'dispatch_outage', 'icon': '🏪', 'label': 'Store Outage', 'desc': 'Dark store systems down'},
    {'id': 'zone_restriction', 'icon': '🚧', 'label': 'Zone Restriction', 'desc': 'Police barricades/VIP movement'},
    {'id': 'unsafe_area', 'icon': '⚠️', 'label': 'Unsafe Conditions', 'desc': 'Mob/riot or severe localized risk'},
  ];

  void _next() {
    if (_triggerType == null) { setState(() => _error = 'Please select a disruption type'); return; }
    setState(() { _error = null; _step = 1; });
    _pageCtrl.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
  }

  Future<void> _submit() async {
    setState(() { _loading = true; _error = null; });
    try {
      await ApiService.post('/claims/file', {'trigger_type': _triggerType});
      widget.onSuccess();
      if (mounted) {
        setState(() => _step = 2);
        _pageCtrl.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('File Claim'), leading: IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context))),
      body: PageView(
        controller: _pageCtrl,
        physics: const NeverScrollableScrollPhysics(),
        children: [_step1(), _step2(), _step3()],
      ),
    );
  }

  Widget _step1() => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('What happened?', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
      const SizedBox(height: 8),
      Text('Select the primary reason you cannot work right now.', style: GoogleFonts.inter(color: AppTheme.textSecondary)),
      const SizedBox(height: 24),
      Expanded(
        child: ListView.separated(
          itemCount: _triggers.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (ctx, i) {
            final t = _triggers[i];
            final sel = _triggerType == t['id'];
            return GestureDetector(
              onTap: () => setState(() { _triggerType = t['id']; _error = null; }),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: sel ? AppTheme.primary.withValues(alpha: 0.15) : AppTheme.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: sel ? AppTheme.primary : AppTheme.surfaceVariant),
                ),
                child: Row(children: [
                  Text(t['icon'], style: const TextStyle(fontSize: 24)),
                  const SizedBox(width: 16),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(t['label'], style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15)),
                    Text(t['desc'], style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 13)),
                  ])),
                  if (sel) const Icon(Icons.check_circle_rounded, color: AppTheme.primary),
                ]),
              ),
            );
          },
        ),
      ),
      if (_error != null) ...[const SizedBox(height: 8), Text(_error!, style: GoogleFonts.inter(color: AppTheme.error))],
      const SizedBox(height: 16),
      SizedBox(width: double.infinity, child: FilledButton(onPressed: _next, child: const Text('Continue'))),
    ]),
  );

  Widget _step2() => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Icon(Icons.info_outline_rounded, size: 64, color: AppTheme.secondary),
      const SizedBox(height: 24),
      Text('Important', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
      const SizedBox(height: 16),
      Text('• Claims can be filed up to 48 hours after your shift ends.\n\n• Filing false claims will permanently flag your account and affect your trust score.\n\n• Payouts are credited instantly to your wallet if approved.', style: GoogleFonts.inter(color: AppTheme.textSecondary, height: 1.5, fontSize: 15), textAlign: TextAlign.left),
      const SizedBox(height: 48),
      if (_error != null) ...[
        Container(
          width: double.infinity, 
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: AppTheme.error.withValues(alpha: 0.1), 
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.error.withValues(alpha: 0.2)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.error_outline_rounded, color: Color(0xFFFCA5A5), size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _error!, 
                  style: GoogleFonts.inter(color: const Color(0xFFFCA5A5), fontSize: 13, height: 1.4),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
      ],
      Row(children: [
        Expanded(child: OutlinedButton(onPressed: _loading ? null : () { setState(() => _step = 0); _pageCtrl.previousPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut); }, style: OutlinedButton.styleFrom(side: const BorderSide(color: AppTheme.surfaceVariant), padding: const EdgeInsets.symmetric(vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))), child: Text('Back', style: GoogleFonts.inter(color: Colors.white)))),
        const SizedBox(width: 16),
        Expanded(flex: 2, child: FilledButton(onPressed: _loading ? null : _submit, style: FilledButton.styleFrom(backgroundColor: AppTheme.success), child: _loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : const Text('Agree & File Claim'))),
      ]),
    ]),
  );

  Widget _step3() => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Container(width: 80, height: 80, decoration: BoxDecoration(color: AppTheme.success.withValues(alpha: 0.15), shape: BoxShape.circle), child: const Icon(Icons.check_rounded, color: AppTheme.success, size: 40)),
      const SizedBox(height: 24),
      Text('Claim Submitted', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
      const SizedBox(height: 12),
      Text('The verification pipeline is now running. Check the Claims tab in a few minutes securely to view your result.', style: GoogleFonts.inter(color: AppTheme.textSecondary, height: 1.5), textAlign: TextAlign.center),
      const SizedBox(height: 48),
      SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(context), style: FilledButton.styleFrom(backgroundColor: AppTheme.surfaceVariant), child: Text('Done', style: GoogleFonts.inter(color: Colors.white)))),
    ]),
  );
}
