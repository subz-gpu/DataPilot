
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiService {
  // Android emulator uses 10.0.2.2 to access computer localhost.
  static const String baseUrl = 'http://10.0.2.2:4000';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  String? _accessToken;

  // Common function for sending JSON HTTP requests.
  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = false,
  }) async {
    final uri = Uri.parse('$baseUrl$path');

    final headers = <String, String>{
      'Content-Type': 'application/json',
    };

    if (authenticated) {
      if (_accessToken == null) {
        throw Exception('Your session has expired. Please log in again.');
      }
      headers['Authorization'] = 'Bearer $_accessToken';
    }

    late http.Response response;

    switch (method) {
      case 'GET':
        response = await http.get(uri, headers: headers);
        break;

      case 'POST':
        response = await http.post(
          uri,
          headers: headers,
          body: jsonEncode(body ?? {}),
        );
        break;

      case 'DELETE':
        response = await http.delete(uri, headers: headers);
        break;

      default:
        throw Exception('Unsupported HTTP method: $method');
    }

    final data = response.body.isNotEmpty
        ? jsonDecode(response.body) as Map<String, dynamic>
        : <String, dynamic>{};

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = data['error'];
      final message = error is Map
          ? error['message']?.toString()
          : null;

      throw Exception(message ?? 'Request failed (${response.statusCode})');
    }

    return data;
  }

  // Save tokens received from the backend.
  Future<void> _saveSession(Map<String, dynamic> data) async {
    _accessToken = data['accessToken']?.toString();

    final refreshToken = data['refreshToken']?.toString();

    if (refreshToken != null) {
      await _storage.write(
        key: 'datapilot.refreshToken',
        value: refreshToken,
      );
    }
  }

  // Register a new user.
  Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final data = await _request(
      'POST',
      '/api/auth/register',
      body: {
        'name': name,
        'email': email,
        'password': password,
      },
    );

    await _saveSession(data);
    return data;
  }

  // Login an existing user.
  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final data = await _request(
      'POST',
      '/api/auth/login',
      body: {
        'email': email,
        'password': password,
      },
    );

    await _saveSession(data);
    return data;
  }

  // Restore a session using the stored refresh token.
  Future<Map<String, dynamic>> refreshSession() async {
    final refreshToken = await _storage.read(
      key: 'datapilot.refreshToken',
    );

    if (refreshToken == null) {
      throw Exception('No saved session found. Please log in.');
    }

    final data = await _request(
      'POST',
      '/api/auth/refresh',
      body: {'refreshToken': refreshToken},
    );

    await _saveSession(data);
    return data;
  }

  // Get the currently authenticated user.
  Future<Map<String, dynamic>> getMe() async {
    return _request(
      'GET',
      '/api/auth/me',
      authenticated: true,
    );
  }

  // Upload a dataset using multipart/form-data.
  Future<Map<String, dynamic>> uploadDataset({
    required String filePath,
  }) async {
    if (_accessToken == null) {
      throw Exception('Your session has expired. Please log in again.');
    }

    final uri = Uri.parse('$baseUrl/api/datasets');

    final request = http.MultipartRequest('POST', uri);

    request.headers['Authorization'] = 'Bearer $_accessToken';

    request.files.add(
      await http.MultipartFile.fromPath('file', filePath),
    );

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    final data = response.body.isNotEmpty
        ? jsonDecode(response.body) as Map<String, dynamic>
        : <String, dynamic>{};

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = data['error'];
      final message = error is Map
          ? error['message']?.toString()
          : null;

      throw Exception(message ?? 'Upload failed (${response.statusCode})');
    }

    return data;
  }

  // Fetch all datasets belonging to the logged-in user.
  Future<List<Map<String, dynamic>>> getDatasets() async {
    final data = await _request(
      'GET',
      '/api/datasets',
      authenticated: true,
    );

    final datasets = data['datasets'];

    if (datasets is! List) {
      return [];
    }

    return datasets
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  // Fetch the profile of a particular dataset.
  Future<Map<String, dynamic>> getDatasetProfile(
    String datasetId,
  ) async {
    return _request(
      'GET',
      '/api/datasets/$datasetId/profile',
      authenticated: true,
    );
  }

  // Delete a dataset.
  Future<void> deleteDataset(String datasetId) async {
    await _request(
      'DELETE',
      '/api/datasets/$datasetId',
      authenticated: true,
    );
  }

  // Create a new AI analysis.
  Future<Map<String, dynamic>> createRun({
    required String datasetId,
    required String objective,
    int? maxSteps,
    int? maxAttempts,
    int? maxLlmCalls,
  }) async {
    final options = <String, dynamic>{};

    if (maxSteps != null) {
      options['maxSteps'] = maxSteps;
    }

    if (maxAttempts != null) {
      options['maxAttempts'] = maxAttempts;
    }

    if (maxLlmCalls != null) {
      options['maxLlmCalls'] = maxLlmCalls;
    }

    return _request(
      'POST',
      '/api/runs',
      authenticated: true,
      body: {
        'datasetId': datasetId,
        'objective': objective,
        'options': options,
      },
    );
  }

  // Fetch analysis history.
  Future<List<Map<String, dynamic>>> getRuns({
    int limit = 30,
  }) async {
    final data = await _request(
      'GET',
      '/api/runs?limit=$limit',
      authenticated: true,
    );

    final runs = data['runs'];

    if (runs is! List) {
      return [];
    }

    return runs.whereType<Map<String, dynamic>>().toList();
  }
  // Fetch dashboard statistics and recent activity.
Future<Map<String, dynamic>> getDashboardStats() async {
  return _request(
    'GET',
    '/api/runs/dashboard',
    authenticated: true,
  );
}

  // Fetch details of a particular analysis, including its report.
  Future<Map<String, dynamic>> getRun(String runId) async {
    return _request(
      'GET',
      '/api/runs/${Uri.encodeComponent(runId)}',
      authenticated: true,
    );
  }

  // Delete a completed analysis.

  // Listen to live events from an AI analysis using SSE.
  Stream<Map<String, dynamic>> streamRunEvents(
    String runId, {
    int maxRetries = 5,
    Duration retryDelay = const Duration(seconds: 1),
  }) async* {
    var lastSeq = -1;
    var failures = 0;
    var finished = false;

    while (!finished) {
      final client = http.Client();
      var statusCode = 0;

      try {
        if (_accessToken == null) {
          throw Exception('Your session has expired. Please log in again.');
        }

        final uri = Uri.parse(
          '$baseUrl/api/runs/${Uri.encodeComponent(runId)}/events',
        );

        final request = http.Request('GET', uri);

        request.headers['Accept'] = 'text/event-stream';
        request.headers['Authorization'] = 'Bearer $_accessToken';

        if (lastSeq >= 0) {
          request.headers['Last-Event-ID'] = '$lastSeq';
        }

        final response = await client.send(request);
        statusCode = response.statusCode;

        // Refresh authentication if the access token expired.
        if (statusCode == 401) {
          await response.stream.drain();
          client.close();
          await refreshSession();
          failures++;

          if (failures > maxRetries) {
            throw Exception('Unable to restore your session.');
          }

          continue;
        }

        if (statusCode < 200 || statusCode >= 300) {
          final body = await response.stream.bytesToString();
          throw Exception(
            'Unable to stream analysis (${response.statusCode}): $body',
          );
        }

        final dataLines = <String>[];

        // Read the continuous SSE response line by line.
        await for (final line in response.stream
            .transform(utf8.decoder)
            .transform(const LineSplitter())) {
          if (line.isEmpty) {
            if (dataLines.isNotEmpty) {
              final decoded = jsonDecode(dataLines.join('\n'));

              dataLines.clear();

              if (decoded is Map) {
                final event = Map<String, dynamic>.from(decoded);

                final seq = event['seq'];

                if (seq is num) {
                  lastSeq = lastSeq < seq.toInt()
                      ? seq.toInt()
                      : lastSeq;
                }

                failures = 0;

                yield event;

                final type = event['type'];

                if (type == 'run_finished' ||
                    type == 'run_error') {
                  finished = true;
                  break;
                }
              }
            }
          } else if (line.startsWith('data:')) {
            var value = line.substring(5);

            if (value.startsWith(' ')) {
              value = value.substring(1);
            }

            dataLines.add(value);
          }
          // SSE comments such as ": keep-alive" are ignored.
        }

        // Process a final event if the stream ended without a blank line.
        if (!finished && dataLines.isNotEmpty) {
          final decoded = jsonDecode(dataLines.join('\n'));

          if (decoded is Map) {
            final event = Map<String, dynamic>.from(decoded);
            final seq = event['seq'];

            if (seq is num) {
              lastSeq = lastSeq < seq.toInt()
                  ? seq.toInt()
                  : lastSeq;
            }

            failures = 0;
            yield event;

            final type = event['type'];

            if (type == 'run_finished' || type == 'run_error') {
              finished = true;
            }
          }
        }

        if (finished) return;

        // Unexpected stream closure: reconnect.
        failures++;

        if (failures > maxRetries) {
          throw Exception('Live analysis connection was lost.');
        }
      } catch (error) {
        if (error is FormatException) rethrow;

        if (statusCode >= 400 && statusCode < 500 &&
            statusCode != 401) {
          rethrow;
        }

        failures++;

        if (failures > maxRetries) {
          rethrow;
        }
      } finally {
        client.close();
      }

      if (!finished) {
        await Future.delayed(retryDelay);
      }
    }
  }

  Future<void> deleteRun(String runId) async {
    await _request(
      'DELETE',
      '/api/runs/${Uri.encodeComponent(runId)}',
      authenticated: true,
    );
  }

  // Logout and remove the saved refresh token.
  Future<void> logout() async {
    final refreshToken = await _storage.read(
      key: 'datapilot.refreshToken',
    );

    try {
      if (refreshToken != null) {
        await _request(
          'POST',
          '/api/auth/logout',
          body: {'refreshToken': refreshToken},
        );
      }
    } finally {
      _accessToken = null;
      await _storage.delete(key: 'datapilot.refreshToken');
    }
  }
}
