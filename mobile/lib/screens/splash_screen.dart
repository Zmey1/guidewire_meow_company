import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 80, height: 80,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(22),
              boxShadow: [BoxShadow(color: const Color(0xFF6366F1).withValues(alpha: 0.4), blurRadius: 24, offset: const Offset(0, 10))],
            ),
            child: const Icon(Icons.shield_rounded, color: Colors.white, size: 40),
          ),
          const SizedBox(height: 20),
          Text('ShiftSure', style: GoogleFonts.inter(fontSize: 30, fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 40),
          const CircularProgressIndicator(color: AppTheme.primary),
        ]),
      ),
    );
  }
}
