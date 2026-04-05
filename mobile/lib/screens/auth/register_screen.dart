import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../main_tabs.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _pageCtrl = PageController();
  int _step = 0;

  // Step 1
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();

  // Step 2
  final List<Map<String, dynamic>> _darkStores = [
    {'id': 'ds_koramangala', 'name': 'Zepto Koramangala'},
    {'id': 'ds_indiranagar', 'name': 'Blinkit Indiranagar'},
    {'id': 'ds_hsr', 'name': 'Swiggy Instamart HSR'},
    {'id': 'ds_whitefield', 'name': 'Zepto Whitefield'},
    {'id': 'ds_electronic_city', 'name': 'Blinkit Electronic City'},
  ];
  String? _selectedDarkStoreId;

  bool _loading = false;
  String? _error;

  void _next() {
    if (_step == 0) {
      if (_nameCtrl.text.isEmpty || _phoneCtrl.text.isEmpty || _passCtrl.text.isEmpty) {
        setState(() => _error = 'Please fill all fields'); return;
      }
      if (_phoneCtrl.text.length != 10) {
        setState(() => _error = 'Please enter a valid 10-digit phone number'); return;
      }
      if (_passCtrl.text.length < 6) {
        setState(() => _error = 'Password must be at least 6 characters'); return;
      }
      setState(() { _error = null; _step = 1; });
      _pageCtrl.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    } else if (_step == 1) {
      if (_selectedDarkStoreId == null) { setState(() => _error = 'Please select a dark store'); return; }
      setState(() { _error = null; _step = 2; });
      _pageCtrl.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    }
  }

  void _back() {
    if (_step > 0) {
      setState(() { _step--; _error = null; });
      _pageCtrl.previousPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    } else {
      Navigator.pop(context);
    }
  }

  Future<void> _submit() async {
    setState(() { _loading = true; _error = null; });
    try {
      final email = '${_phoneCtrl.text.trim()}@shiftsure.in';
      await FirebaseAuth.instance.createUserWithEmailAndPassword(email: email, password: _passCtrl.text.trim());
      // Write worker profile to backend
      await ApiService.post('/workers/register', {
        'name': _nameCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
        'dark_store_id': _selectedDarkStoreId,
      });
      // No manual navigation needed; main.dart handles it via authStateChanges stream
    } on FirebaseAuthException catch (e) {
      setState(() { _error = e.code == 'email-already-in-use' ? 'Phone already registered. Please login.' : e.message; });
    } catch (e) {
      setState(() {_error = e.toString();});
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          // Progress
          Padding(
            padding: const EdgeInsets.all(24),
            child: Row(children: [
              IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: _back),
              const SizedBox(width: 8),
              Text('${_step + 1} / 3', style: GoogleFonts.inter(color: AppTheme.textSecondary)),
              const SizedBox(width: 12),
              Expanded(child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: (_step + 1) / 3,
                  backgroundColor: AppTheme.surfaceVariant,
                  color: AppTheme.primary,
                  minHeight: 4,
                ),
              )),
            ]),
          ),
          Expanded(
            child: PageView(
              controller: _pageCtrl,
              physics: const NeverScrollableScrollPhysics(),
              children: [_step1(), _step2(), _step3()],
            ),
          ),
        ]),
      ),
    );
  }

  Widget _step1() => SingleChildScrollView(
    padding: const EdgeInsets.all(24),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Create Account', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
      const SizedBox(height: 8),
      Text('Tell us about yourself', style: GoogleFonts.inter(color: AppTheme.textSecondary)),
      const SizedBox(height: 32),
      TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Full name'), style: GoogleFonts.inter(color: Colors.white)),
      const SizedBox(height: 16),
      TextField(
        controller: _phoneCtrl,
        keyboardType: TextInputType.phone,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(10),
        ],
        decoration: const InputDecoration(labelText: 'Phone number'),
        style: GoogleFonts.inter(color: Colors.white),
      ),
      const SizedBox(height: 16),
      TextField(controller: _passCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Password'), style: GoogleFonts.inter(color: Colors.white)),
      if (_error != null) ...[const SizedBox(height: 12), Text(_error!, style: GoogleFonts.inter(color: AppTheme.error))],
      const SizedBox(height: 48),
      SizedBox(width: double.infinity, child: FilledButton(onPressed: _next, child: const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('Next', style: TextStyle(fontSize: 16))))),
    ]),
  );

  Widget _step2() => SingleChildScrollView(
    padding: const EdgeInsets.all(24),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Your Dark Store', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
      const SizedBox(height: 8),
      Text('Where do you pick up orders from?', style: GoogleFonts.inter(color: AppTheme.textSecondary)),
      const SizedBox(height: 32),
      ...(_darkStores.map((ds) => GestureDetector(
        onTap: () => setState(() { _selectedDarkStoreId = ds['id']; _error = null; }),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: _selectedDarkStoreId == ds['id'] ? AppTheme.primary.withValues(alpha: 0.15) : AppTheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _selectedDarkStoreId == ds['id'] ? AppTheme.primary : const Color(0xFF334155)),
          ),
          child: Row(children: [
            const Icon(Icons.store_rounded, color: AppTheme.textSecondary),
            const SizedBox(width: 12),
            Text(ds['name'], style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w500)),
            const Spacer(),
            if (_selectedDarkStoreId == ds['id']) const Icon(Icons.check_circle_rounded, color: AppTheme.primary, size: 20),
          ]),
        ),
      ))),
      if (_error != null) ...[const SizedBox(height: 8), Text(_error!, style: GoogleFonts.inter(color: AppTheme.error))],
      const SizedBox(height: 48),
      SizedBox(width: double.infinity, child: FilledButton(onPressed: _next, child: const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('Next', style: TextStyle(fontSize: 16))))),
    ]),
  );

  Widget _step3() => SingleChildScrollView(
    padding: const EdgeInsets.all(24),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Income Setup', style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
      const SizedBox(height: 8),
      Text('Your weekly income will be fetched automatically from the platform mock API after account creation.', style: GoogleFonts.inter(color: AppTheme.textSecondary)),
      const SizedBox(height: 24),
      Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: Row(
          children: [
            const Icon(Icons.cloud_download_rounded, color: AppTheme.secondary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Source: mock_income_api\nRange: ₹8,000 - ₹15,000 / week',
                style: GoogleFonts.inter(color: Colors.white, height: 1.4),
              ),
            ),
          ],
        ),
      ),
      if (_error != null) ...[Text(_error!, style: GoogleFonts.inter(color: AppTheme.error))],
      const SizedBox(height: 48),
      SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3, color: Colors.white)) : const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('Create Account', style: TextStyle(fontSize: 16))),
        ),
      ),
    ]),
  );
}
