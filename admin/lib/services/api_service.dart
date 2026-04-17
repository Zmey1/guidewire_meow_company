import 'package:http/http.dart' as http;
import 'dart:convert';
import 'auth_service.dart';

class ApiService {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api',
  );

  static Future<Map<String, String>> _headers() async {
    final token = await AuthService.getIdToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> get(String path) async {
    final res = await http.get(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
    );
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> body) async {
    final res = await http.patch(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return jsonDecode(res.body);
  }
}
