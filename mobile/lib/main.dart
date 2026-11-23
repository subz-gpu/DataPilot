
import 'package:material_ui/material_ui.dart';
import 'services/api_service.dart';
import 'package:file_picker/file_picker.dart';
import 'dart:async';
void main() {
  runApp(const DataPilotApp());
}

class DataPilotApp extends StatelessWidget {
  const DataPilotApp({super.key});

  @override
  Widget build(BuildContext context) {
    const blue = Color(0xFF3978F6);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'DataPilot',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF7F8FC),
        colorScheme: ColorScheme.fromSeed(
          seedColor: blue,
          primary: blue,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFF8FAFC),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 17,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFE4E7EC)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFE4E7EC)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(
              color: blue,
              width: 1.5,
            ),
          ),
        ),
      ),
      home: const AuthScreen(),
    );
  }
}

// --------------------------------------------------
// AUTHENTICATION SCREEN
// --------------------------------------------------

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  final ApiService _apiService = ApiService();

  bool _isLogin = true;
  bool _obscurePassword = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _switchMode() {
    if (_isLoading) return;

    setState(() {
      _isLogin = !_isLogin;
      _obscurePassword = true;

      _nameController.clear();
      _emailController.clear();
      _passwordController.clear();

      _formKey.currentState?.reset();
    });
  }

  // --------------------------------------------------
  // NAME VALIDATION
  // --------------------------------------------------

  String? _validateName(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Name is required';
    }

    final name = value.trim();

    if (name.length < 2 || name.length > 80) {
      return 'Name must be between 2 and 80 characters';
    }

    final validName = RegExp(
      r"^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$",
      unicode: true,
    );

    if (!validName.hasMatch(name)) {
      return 'Please enter a valid name';
    }

    return null;
  }

  // --------------------------------------------------
  // EMAIL VALIDATION
  // --------------------------------------------------

  String? _validateEmail(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Email is required';
    }

    final email = value.trim();

    final emailPattern = RegExp(
      r'^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$',
    );

    if (!emailPattern.hasMatch(email) || email.length > 254) {
      return 'Enter a valid email address';
    }

    return null;
  }

  // --------------------------------------------------
  // PASSWORD VALIDATION
  // --------------------------------------------------

  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Password is required';
    }

    // Existing users can log in with their existing passwords.
    if (_isLogin) return null;

    if (value.length < 8) {
      return 'At least 8 characters required';
    }

    if (!RegExp(r'[A-Z]').hasMatch(value)) {
      return 'Include an uppercase letter';
    }

    if (!RegExp(r'[a-z]').hasMatch(value)) {
      return 'Include a lowercase letter';
    }

    if (!RegExp(r'[0-9]').hasMatch(value)) {
      return 'Include a number';
    }

    if (!RegExp(r'[^A-Za-z0-9\s]').hasMatch(value)) {
      return 'Include a special character';
    }

    if (value.length > 72) {
      return 'Password is too long';
    }

    return null;
  }

  // --------------------------------------------------
  // LOGIN AND REGISTRATION API
  // --------------------------------------------------

  Future<void> _submit() async {
    if (_isLoading) return;

    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      late Map<String, dynamic> response;

      if (_isLogin) {
        // LOGIN REQUEST
        response = await _apiService.login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
      } else {
        // REGISTRATION REQUEST
        response = await _apiService.register(
          name: _nameController.text.trim(),
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
      }

      if (!mounted) return;

      final user = response['user'];

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => DataPilotHomeScreen(
            user: user is Map
                ? Map<String, dynamic>.from(user)
                : <String, dynamic>{},
            apiService: _apiService,
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;

      final message = error.toString().replaceFirst(
        'Exception: ',
        '',
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.red.shade700,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  // --------------------------------------------------
  // BUILD AUTH SCREEN
  // --------------------------------------------------

  @override
  Widget build(BuildContext context) {
    const navy = Color(0xFF101828);
    const muted = Color(0xFF667085);
    const blue = Color(0xFF3978F6);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(
              horizontal: 24,
              vertical: 32,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // BRAND
                  Row(
                    children: [
                      Container(
                        height: 46,
                        width: 46,
                        decoration: BoxDecoration(
                          color: blue,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          Icons.auto_awesome,
                          color: Colors.white,
                          size: 26,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Text(
                        'DataPilot',
                        style: TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.bold,
                          color: navy,
                          letterSpacing: -0.5,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 48),

                  const Text(
                    'YOUR DATA. YOUR DECISIONS.',
                    style: TextStyle(
                      color: blue,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.5,
                    ),
                  ),

                  const SizedBox(height: 12),

                  Text(
                    _isLogin
                        ? 'Welcome back.'
                        : 'Create your account.',
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: navy,
                      letterSpacing: -1,
                    ),
                  ),

                  const SizedBox(height: 10),

                  const Text(
                    'Let AI do the analysis. You focus on the insights.',
                    style: TextStyle(
                      color: muted,
                      fontSize: 15,
                      height: 1.5,
                    ),
                  ),

                  const SizedBox(height: 32),

                  // AUTHENTICATION FORM
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: const Color(0xFFEAECF0),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.035),
                          blurRadius: 24,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _isLogin
                                ? 'Sign in to your account'
                                : 'Get started with DataPilot',
                            style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.bold,
                              color: navy,
                            ),
                          ),

                          const SizedBox(height: 24),

                          // NAME FIELD
                          if (!_isLogin) ...[
                            _buildLabel('Full name'),
                            TextFormField(
                              controller: _nameController,
                              validator: _validateName,
                              textCapitalization:
                                  TextCapitalization.words,
                              enabled: !_isLoading,
                              decoration: const InputDecoration(
                                hintText: 'Enter your full name',
                                prefixIcon: Icon(Icons.person_outline),
                              ),
                            ),
                            const SizedBox(height: 20),
                          ],

                          // EMAIL FIELD
                          _buildLabel('Email address'),
                          TextFormField(
                            controller: _emailController,
                            validator: _validateEmail,
                            keyboardType: TextInputType.emailAddress,
                            enabled: !_isLoading,
                            decoration: const InputDecoration(
                              hintText: 'you@example.com',
                              prefixIcon: Icon(Icons.email_outlined),
                            ),
                          ),

                          const SizedBox(height: 20),

                          // PASSWORD FIELD
                          _buildLabel('Password'),
                          TextFormField(
                            controller: _passwordController,
                            validator: _validatePassword,
                            obscureText: _obscurePassword,
                            enabled: !_isLoading,
                            decoration: InputDecoration(
                              hintText: 'Enter your password',
                              prefixIcon: const Icon(Icons.lock_outline),
                              suffixIcon: IconButton(
                                onPressed: () {
                                  setState(() {
                                    _obscurePassword =
                                        !_obscurePassword;
                                  });
                                },
                                icon: Icon(
                                  _obscurePassword
                                      ? Icons.visibility_outlined
                                      : Icons.visibility_off_outlined,
                                ),
                              ),
                            ),
                          ),

                          // PASSWORD REQUIREMENTS
                          if (!_isLogin) ...[
                            const SizedBox(height: 10),
                            const Text(
                              'Use at least 8 characters with uppercase, '
                              'lowercase, a number and a special character.',
                              style: TextStyle(
                                color: muted,
                                fontSize: 12,
                                height: 1.5,
                              ),
                            ),
                          ],

                          const SizedBox(height: 26),

                          // SUBMIT BUTTON
                          SizedBox(
                            width: double.infinity,
                            height: 52,
                            child: FilledButton(
                              onPressed: _isLoading ? null : _submit,
                              style: FilledButton.styleFrom(
                                backgroundColor: blue,
                                foregroundColor: Colors.white,
                                disabledBackgroundColor:
                                    blue.withValues(alpha: 0.6),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: _isLoading
                                  ? const SizedBox(
                                      height: 22,
                                      width: 22,
                                      child: CircularProgressIndicator(
                                        color: Colors.white,
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : Text(
                                      _isLogin
                                          ? 'Sign in'
                                          : 'Create account',
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                            ),
                          ),

                          const SizedBox(height: 22),

                          // SWITCH LOGIN / SIGNUP
                          Center(
                            child: Wrap(
                              alignment: WrapAlignment.center,
                              children: [
                                Text(
                                  _isLogin
                                      ? "Don't have an account? "
                                      : 'Already have an account? ',
                                  style: const TextStyle(color: muted),
                                ),
                                GestureDetector(
                                  onTap: _isLoading ? null : _switchMode,
                                  child: const Text(
                                    ' ',
                                    style: TextStyle(color: blue),
                                  ),
                                ),
                                GestureDetector(
                                  onTap: _isLoading ? null : _switchMode,
                                  child: Text(
                                    _isLogin ? 'Sign up' : 'Sign in',
                                    style: const TextStyle(
                                      color: blue,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 28),

                  const Center(
                    child: Text(
                      'Powered by intelligent AI agents',
                      style: TextStyle(
                        color: muted,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Color(0xFF344054),
        ),
      ),
    );
  }
}

// --------------------------------------------------
// DATAPILOT HOME SCREEN
// --------------------------------------------------


class DataPilotHomeScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  final ApiService apiService;

  const DataPilotHomeScreen({
    super.key,
    required this.user,
    required this.apiService,
  });

  @override
  State<DataPilotHomeScreen> createState() =>
      _DataPilotHomeScreenState();
}

class _DataPilotHomeScreenState extends State<DataPilotHomeScreen> {
  int _selectedIndex = 0;
  bool _isLoggingOut = false;

  static const Color blue = Color(0xFF3978F6);
  static const Color navy = Color(0xFF101828);
  static const Color muted = Color(0xFF667085);

  String get _name =>
      widget.user['name']?.toString() ?? 'User';

  String get _email =>
      widget.user['email']?.toString() ?? '';
  // Dashboard data
Map<String, dynamic> _dashboardStats = {};
bool _dashboardLoading = true;
String? _dashboardError;

@override
void initState() {
  super.initState();
  _loadDashboard();
}

Future<void> _loadDashboard() async {
  if (mounted) {
    setState(() {
      _dashboardLoading = true;
      _dashboardError = null;
    });
  }

  try {
    final data = await widget.apiService.getDashboardStats();

    if (!mounted) return;

    setState(() {
      _dashboardStats = data;
      _dashboardLoading = false;
    });
  } catch (error) {
    if (!mounted) return;

    setState(() {
      _dashboardError = error.toString().replaceFirst(
        'Exception: ',
        '',
      );
      _dashboardLoading = false;
    });
  }
}

String _dashboardValue(String key) {
  if (_dashboardLoading) return '...';
  if (_dashboardError != null) return '—';

  return (_dashboardStats[key] ?? 0).toString();
}

  Future<void> _logout() async {
    if (_isLoggingOut) return;

    setState(() {
      _isLoggingOut = true;
    });

    try {
      await widget.apiService.logout();

      if (!mounted) return;

      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => const AuthScreen(),
        ),
        (route) => false,
      );
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.toString().replaceFirst('Exception: ', ''),
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoggingOut = false;
        });
      }
    }
  }

void _showProfile() {
  final initial = _name.trim().isNotEmpty
      ? _name.trim()[0].toUpperCase()
      : 'U';

  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.white,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(24),
      ),
    ),
    builder: (sheetContext) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 5,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE4E7EC),
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),

              const SizedBox(height: 25),

              const Text(
                'Your Profile',
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF101828),
                ),
              ),

              const SizedBox(height: 22),

              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: const Color(0xFFF7F8FC),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: const Color(0xFFEAECF0),
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: blue.withValues(alpha: 0.12),
                      child: Text(
                        initial,
                        style: const TextStyle(
                          color: blue,
                          fontSize: 23,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),

                    const SizedBox(width: 15),

                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _name,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF101828),
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            _email,
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF667085),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              const Text(
                'ACCOUNT',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                  color: Color(0xFF98A2B3),
                ),
              ),

              const SizedBox(height: 12),

              Material(
                color: const Color(0xFFFFF5F5),
                borderRadius: BorderRadius.circular(13),
                child: InkWell(
                  borderRadius: BorderRadius.circular(13),
                  onTap: _isLoggingOut
                      ? null
                      : () async {
                          Navigator.pop(sheetContext);
                          await _logout();
                        },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 15,
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.logout_rounded,
                          color: Color(0xFFD92D20),
                          size: 21,
                        ),
                        const SizedBox(width: 13),
                        const Expanded(
                          child: Text(
                            'Sign out',
                            style: TextStyle(
                              color: Color(0xFFD92D20),
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        if (_isLoggingOut)
                          const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFFD92D20),
                            ),
                          )
                        else
                          const Icon(
                            Icons.arrow_forward_ios_rounded,
                            color: Color(0xFFD92D20),
                            size: 15,
                          ),
                      ],
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 10),
            ],
          ),
        ),
      );
    },
  );
}


 

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildDashboard(),
      _buildDatasets(),
      _buildWorkspace(),
      _buildReports(),
    ];

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FC),

      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.white,
        title: Row(
          children: [
            Container(
              height: 36,
              width: 36,
              decoration: BoxDecoration(
                color: blue,
                borderRadius: BorderRadius.circular(11),
              ),
              child: const Icon(
                Icons.auto_awesome,
                color: Colors.white,
                size: 21,
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'DataPilot',
              style: TextStyle(
                color: navy,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        
actions: [
  Padding(
    padding: const EdgeInsets.only(right: 12),
    child: IconButton(
      onPressed: _showProfile,
      tooltip: 'Your Profile',
      style: IconButton.styleFrom(
        backgroundColor: const Color(0xFFF2F4F7),
        foregroundColor: navy,
        fixedSize: const Size(42, 42),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(13),
        ),
      ),
      icon: const Icon(
        Icons.person_outline_rounded,
        size: 23,
      ),
    ),
  ),
],

      ),

      body: SafeArea(
        child: IndexedStack(
          index: _selectedIndex,
          children: pages,
        ),
      ),

      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        backgroundColor: Colors.white,
        indicatorColor: blue.withValues(alpha: 0.12),
        onDestinationSelected: (index) {
          setState(() {
            _selectedIndex = index;
          });
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard, color: blue),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.folder_open_outlined),
            selectedIcon: Icon(Icons.folder, color: blue),
            label: 'Datasets',
          ),
          NavigationDestination(
            icon: Icon(Icons.smart_toy_outlined),
            selectedIcon: Icon(Icons.smart_toy, color: blue),
            label: 'AI',
          ),
          NavigationDestination(
            icon: Icon(Icons.assessment_outlined),
            selectedIcon: Icon(Icons.assessment, color: blue),
            label: 'Reports',
          ),
        ],
      ),
    );
  }

  // ==========================================
  // DASHBOARD
  // ==========================================

 Widget _buildDashboard() {
  return RefreshIndicator(
    onRefresh: _loadDashboard,
    color: blue,
    child: SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),

          Text(
            'Hello, $_name 👋',
            style: const TextStyle(
              fontSize: 25,
              fontWeight: FontWeight.bold,
              color: navy,
            ),
          ),

          const SizedBox(height: 8),

          const Text(
            'Ready to turn your data into insights?',
            style: TextStyle(
              color: muted,
              fontSize: 14,
            ),
          ),

          const SizedBox(height: 25),

          // AI WORKSPACE BANNER

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [
                  Color(0xFF3978F6),
                  Color(0xFF2454C6),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.auto_awesome,
                  color: Colors.white,
                  size: 30,
                ),

                const SizedBox(height: 15),

                const Text(
                  'Your AI Data Assistant',
                  style: TextStyle(
                    fontSize: 21,
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 8),

                const Text(
                  'Upload your dataset and let intelligent AI agents '
                  'analyze your data, discover patterns and generate insights.',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    height: 1.5,
                  ),
                ),

                const SizedBox(height: 18),

                ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      _selectedIndex = 2;
                    });
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: blue,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 13,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  icon: const Icon(Icons.rocket_launch_outlined),
                  label: const Text(
                    'Start analyzing',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 28),

          const Text(
            'Workspace Overview',
            style: TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.bold,
              color: navy,
            ),
          ),

          const SizedBox(height: 15),

          // STATISTICS

         GridView.count(
  crossAxisCount: 2,
  shrinkWrap: true,
  physics: const NeverScrollableScrollPhysics(),
  crossAxisSpacing: 14,
  mainAxisSpacing: 14,
  childAspectRatio: 1.35,
  children: [
    _statCard(
      'Total Datasets',
      _dashboardValue('totalDatasets'),
      Icons.folder_outlined,
      const Color(0xFF3978F6),
    ),
    _statCard(
      'Analyses',
      _dashboardValue('totalAnalyses'),
      Icons.analytics_outlined,
      const Color(0xFF12B76A),
    ),
    _statCard(
      'Completed',
      _dashboardValue('successfulAnalyses'),
      Icons.task_alt,
      const Color(0xFF9B59B6),
    ),
    _statCard(
      'Reports',
      _dashboardValue('totalReports'),
      Icons.description_outlined,
      const Color(0xFFEE9B35),
    ),
  ],
),

          const SizedBox(height: 28),

          const Text(
            'Recent Activity',
            style: TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.bold,
              color: navy,
            ),
          ),

          const SizedBox(height: 14),

          _buildRecentActivity(),

          const SizedBox(height: 25),
        ],
      ),
    ),
    );
  }

  // ==========================================
  // STATISTICS CARD
  // ==========================================

String _formatActivityDate(dynamic value) {
  final date = DateTime.tryParse(value?.toString() ?? '');

  if (date == null) return 'Date unavailable';

  final local = date.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');

  return '$day/$month/${local.year}';
}

Widget _buildRecentActivity() {
  if (_dashboardLoading) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: CircularProgressIndicator(),
      ),
    );
  }

  if (_dashboardError != null) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          const Icon(Icons.cloud_off, color: muted, size: 32),
          const SizedBox(height: 10),
          const Text('Unable to load dashboard data'),
          const SizedBox(height: 8),
          Text(
            _dashboardError!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: muted, fontSize: 12),
          ),
          TextButton.icon(
            onPressed: _loadDashboard,
            icon: const Icon(Icons.refresh),
            label: const Text('Try again'),
          ),
        ],
      ),
    );
  }

  final activities = <Map<String, dynamic>>[];

  final datasets = _dashboardStats['recentDatasets'];

  if (datasets is List) {
    for (final item in datasets.whereType<Map<String, dynamic>>()) {
      activities.add({
  'id': item['id']?.toString(),
  'type': 'dataset',
  'title': item['filename']?.toString() ?? 'Dataset uploaded',
  'subtitle': 'Dataset uploaded',
  'date': item['createdAt'],
  'icon': Icons.upload_file,
  'color': blue,
});
    }
  }

  final runs = _dashboardStats['recentRuns'];

  if (runs is List) {
    for (final item in runs.whereType<Map<String, dynamic>>()) {
      final status = item['status']?.toString() ?? 'unknown';
      final objective = item['objective']?.toString() ?? 'AI analysis';

      activities.add({
  'id': item['id']?.toString(),
  'type': 'analysis',
  'title': objective,
  'subtitle': 'Analysis • ${status.toUpperCase()}',
  'date': item['createdAt'],
  'icon': Icons.analytics_outlined,
  'color': status == 'succeeded'
      ? const Color(0xFF12B76A)
      : status == 'failed' || status == 'error'
          ? Colors.red
          : const Color(0xFF9B59B6),
});
    }
  }

  activities.sort((a, b) {
    final dateA = DateTime.tryParse(a['date']?.toString() ?? '') ??
        DateTime.fromMillisecondsSinceEpoch(0);

    final dateB = DateTime.tryParse(b['date']?.toString() ?? '') ??
        DateTime.fromMillisecondsSinceEpoch(0);

    return dateB.compareTo(dateA);
  });

  final recent = activities.take(5).toList();

  if (recent.isEmpty) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEAECF0)),
      ),
      child: const Column(
        children: [
          Icon(Icons.history, size: 38, color: Color(0xFF98A2B3)),
          SizedBox(height: 12),
          Text(
            'No activity yet',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 15,
              color: navy,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Your dataset uploads and AI analyses will appear here.',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted, fontSize: 13),
          ),
        ],
      ),
    );
  }

  return Container(
    padding: const EdgeInsets.symmetric(vertical: 8),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: const Color(0xFFEAECF0)),
    ),
    child: Column(
      children: recent.map((activity) {
        final color = activity['color'] as Color;

return ListTile(
  onTap: () {
    final type = activity['type'];
    final id = activity['id']?.toString();

    if (type == 'analysis' && id != null && id.isNotEmpty) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => AnalysisDetailsScreen(
            apiService: widget.apiService,
            runId: id,
          ),
        ),
      ).then((_) {
        _loadDashboard();
      });
    } else if (type == 'dataset') {
      setState(() {
        _selectedIndex = 1;
      });
    }
  },
  leading: CircleAvatar(
    backgroundColor: color.withValues(alpha: 0.10),
    child: Icon(
      activity['icon'] as IconData,
      color: color,
      size: 21,
    ),
  ),
  title: Text(
    activity['title'].toString(),
    maxLines: 1,
    overflow: TextOverflow.ellipsis,
    style: const TextStyle(
      fontWeight: FontWeight.w600,
      fontSize: 14,
      color: navy,
    ),
  ),
  subtitle: Text(
    activity['subtitle'].toString(),
    style: const TextStyle(fontSize: 12, color: muted),
  ),
  trailing: Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        _formatActivityDate(activity['date']),
        style: const TextStyle(fontSize: 11, color: muted),
      ),
      const SizedBox(width: 6),
      const Icon(
        Icons.chevron_right,
        size: 18,
        color: muted,
      ),
    ],
  ),
);
      }).toList(),
    ),
  );
}

  Widget _statCard(
    String title,
    String value,
    IconData icon,
    Color color,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFFEAECF0),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              icon,
              color: color,
              size: 22,
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontSize: 23,
                  fontWeight: FontWeight.bold,
                  color: navy,
                ),
              ),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 12,
                  color: muted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ==========================================
  // DATASETS SCREEN
  // ==========================================

Widget _buildDatasets() {
  return DatasetScreen(apiService: widget.apiService);
}

  // ==========================================
  // AI WORKSPACE SCREEN
  // ==========================================

Widget _buildWorkspace() {
  return NewAnalysisScreen(
    apiService: widget.apiService,
    refreshTrigger: _selectedIndex,
  );
}

  // ==========================================
  // REPORTS SCREEN
  // ==========================================

  Widget _buildReports() {
    return _emptyScreen(
      icon: Icons.assessment_outlined,
      title: 'Analysis Reports',
      description:
          'View your generated reports, visualizations and '
          'AI-powered recommendations here.',
      buttonText: 'Explore Workspace',
      onPressed: () {
        setState(() {
          _selectedIndex = 2;
        });
      },
    );
  }

  // ==========================================
  // REUSABLE EMPTY SCREEN
  // ==========================================

  Widget _emptyScreen({
    required IconData icon,
    required String title,
    required String description,
    required String buttonText,
    required VoidCallback onPressed,
  }) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              height: 100,
              width: 100,
              decoration: BoxDecoration(
                color: blue.withValues(alpha: 0.09),
                borderRadius: BorderRadius.circular(25),
              ),
              child: Icon(
                icon,
                size: 48,
                color: blue,
              ),
            ),

            const SizedBox(height: 25),

            Text(
              title,
              style: const TextStyle(
                fontSize: 23,
                fontWeight: FontWeight.bold,
                color: navy,
              ),
              textAlign: TextAlign.center,
            ),

            const SizedBox(height: 12),

            Text(
              description,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: muted,
                fontSize: 14,
                height: 1.6,
              ),
            ),

            const SizedBox(height: 25),

            FilledButton.icon(
              onPressed: onPressed,
              icon: const Icon(Icons.arrow_forward),
              label: Text(buttonText),
              style: FilledButton.styleFrom(
                backgroundColor: blue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 15,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class DatasetScreen extends StatefulWidget {
  final ApiService apiService;

  const DatasetScreen({
    super.key,
    required this.apiService,
  });

  @override
  State<DatasetScreen> createState() => _DatasetScreenState();
}

class NewAnalysisScreen extends StatefulWidget {
  final ApiService apiService;
  final int refreshTrigger;

  const NewAnalysisScreen({
    super.key,
    required this.apiService,
    required this.refreshTrigger,
  });

  @override
  State<NewAnalysisScreen> createState() =>
      _NewAnalysisScreenState();
}

class AnalysisDetailsScreen extends StatefulWidget {
  final ApiService apiService;
  final String runId;

  const AnalysisDetailsScreen({
    super.key,
    required this.apiService,
    required this.runId,
  });

  @override
  State<AnalysisDetailsScreen> createState() =>
      _AnalysisDetailsScreenState();
}

class _AnalysisDetailsScreenState
    extends State<AnalysisDetailsScreen> {
  Map<String, dynamic>? _run;
  bool _isLoading = true;
  String? _error;

  StreamSubscription<Map<String, dynamic>>? _eventSubscription;

  final List<Map<String, dynamic>> _liveEvents = [];

  String? _streamError;

 @override
void initState() {
  super.initState();
  _loadRun();
  _startLiveStream();
}

Future<void> _startLiveStream() async {
  await _eventSubscription?.cancel();

  if (!mounted) return;

  setState(() {
    _liveEvents.clear();
    _streamError = null;
  });

  _eventSubscription = widget.apiService
      .streamRunEvents(widget.runId)
      .listen(
    (event) {
      if (!mounted) return;

      setState(() {
        _liveEvents.add(event);
      });

      // Refresh the complete run when a major event arrives.
      final type = event['type'];

      if (type == 'run_finished' || type == 'run_error') {
        _loadRun();
      }
    },
    onError: (error) {
      if (!mounted) return;

      setState(() {
        _streamError = error.toString()
            .replaceFirst('Exception: ', '');
      });
    },
  );
}


  Future<void> _loadRun() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final result = await widget.apiService.getRun(widget.runId);

      if (!mounted) return;

      setState(() {
        _run = result;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  Widget _buildSection(String title, Widget child) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }

  Widget _buildList(String title, dynamic items) {
    if (items is! List || items.isEmpty) {
      return const Text('No information available yet.');
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: items.asMap().entries.map((entry) {
        final item = entry.value;

        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 13,
                child: Text('${entry.key + 1}'),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item is Map
                      ? item.entries
                          .map((e) => '${e.key}: ${e.value}')
                          .join('\n')
                      : item.toString(),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analysis Details'),
        actions: [
          IconButton(
            onPressed: _isLoading ? null : _loadRun,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh analysis',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loadRun,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              : _run == null
                  ? const Center(child: Text('Analysis not found.'))
                  : _buildRunContent(),
    );
  }

String _eventTitle(Map<String, dynamic> event) {
  final type = event['type']?.toString() ?? '';
  final data = event['data'] is Map
      ? Map<String, dynamic>.from(event['data'])
      : <String, dynamic>{};

  switch (type) {
    case 'profiling_started':
      return 'Profiling dataset';

    case 'profile_ready':
      return 'Dataset profile completed';

    case 'planning_started':
      return 'Planner is creating an analysis plan';

    case 'plan_created':
      return 'Analysis plan created';

    case 'step_started':
      return 'Step ${data['index']}: ${data['title']} started';

    case 'attempt_started':
      return 'Coder started attempt ${data['attempt']}';

    case 'code_generated':
      return 'Code generated successfully';

    case 'execution_started':
      return 'Executing code in sandbox';

    case 'execution_result':
      return 'Code execution completed';

    case 'critic_verdict':
      final verdict = data['verdict'];
      final approved = verdict is Map && verdict['approve'] == true;
      return approved
          ? 'Critic approved the result'
          : 'Critic requested improvements';

    case 'retry':
      return 'Retrying with feedback';

    case 'step_done':
      return 'Step ${data['index']} completed';

    case 'step_skipped':
      return 'Step ${data['index']} skipped';

    case 'reporting_started':
      return 'Reporter is generating the report';

    case 'report_ready':
      return 'Final report generated';

    case 'run_finished':
      return 'Analysis finished';

    case 'run_error':
      return 'Analysis failed';

    default:
      return type.replaceAll('_', ' ');
  }
}

Widget _buildLiveTimeline() {
  if (_liveEvents.isEmpty) {
    return const Text(
      'Waiting for agent activity...',
      style: TextStyle(color: Colors.grey),
    );
  }

  return Column(
    children: _liveEvents.map((event) {
      final title = _eventTitle(event);
      final type = event['type']?.toString() ?? '';

      final data = event['data'] is Map
          ? Map<String, dynamic>.from(event['data'])
          : <String, dynamic>{};

      IconData icon = Icons.circle_outlined;
      Color color = Colors.blue;

      if (type == 'run_finished' ||
          (type == 'critic_verdict' &&
              data['verdict'] is Map &&
              data['verdict']['approve'] == true)) {
        icon = Icons.check_circle;
        color = Colors.green;
      } else if (type == 'run_error' ||
          type == 'step_skipped') {
        icon = Icons.error_outline;
        color = Colors.red;
      } else if (type == 'retry' ||
          type == 'critic_verdict') {
        icon = Icons.rate_review;
        color = Colors.orange;
      } else if (type == 'execution_started' ||
          type == 'attempt_started') {
        icon = Icons.play_circle_outline;
        color = Colors.blue;
      }

      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (type == 'critic_verdict')
                    Text(
                      data['verdict'] is Map
                          ? (data['verdict']['approve'] == true
                              ? 'The result passed review.'
                              : 'The result needs improvements.')
                          : '',
                      style: const TextStyle(
                        color: Colors.grey,
                        fontSize: 12,
                      ),
                    ),
                  if (type == 'retry')
                    Text(
                      data['reason']?.toString() ?? '',
                      style: const TextStyle(
                        color: Colors.grey,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    }).toList(),
  );
}

  Widget _buildRunContent() {
    final run = _run!;
    final status = run['status']?.toString() ?? 'unknown';

    return RefreshIndicator(
      onRefresh: _loadRun,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSection(
            'Analysis Status',
            Row(
              children: [
                const Icon(Icons.circle, color: Colors.blue, size: 12),
                const SizedBox(width: 10),
                Text(
                  status.toUpperCase(),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          _buildSection(
  'Live Agent Activity',
  _buildLiveTimeline(),
),
          if (_streamError != null)

  _buildSection(
    'Live Connection',
    Text(
      _streamError!,
      style: const TextStyle(color: Colors.red),
    ),
  ),

          _buildSection(
            'Objective',
            Text(
              run['objective']?.toString() ?? 'Not available',
            ),
          ),

          _buildSection(
            'Agent Plan',
            _buildList('Execution Plan', run['plan']),
          ),

          _buildSection(
            'Execution Steps',
            _buildList('Agent Activity', run['steps']),
          ),

          if (run['error'] != null)
            _buildSection(
              'Error',
              Text(run['error'].toString()),
            ),

          if (run['report'] != null)
            _buildSection(
              'Final Report',
              SelectableText(run['report'].toString()),
            ),

          const SizedBox(height: 12),

          const Text(
            'Pull down or tap refresh to check for updates.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey),
          ),
        ],
      ),
    );
  }
  @override
void dispose() {
  _eventSubscription?.cancel();
  super.dispose();
}
}


class _NewAnalysisScreenState extends State<NewAnalysisScreen> {
  List<Map<String, dynamic>> _datasets = [];

  String? _selectedDatasetId;

  final TextEditingController _objectiveController =
      TextEditingController();

  bool _isLoading = true;
  bool _isSubmitting = false;

  @override
void didUpdateWidget(covariant NewAnalysisScreen oldWidget) {
  super.didUpdateWidget(oldWidget);

  if (oldWidget.refreshTrigger != widget.refreshTrigger &&
      widget.refreshTrigger == 2) {
    _loadDatasets();
  }
}

  @override
  void initState() {
    super.initState();
    _loadDatasets();
  }

  Future<void> _loadDatasets() async {
    try {
      final datasets = await widget.apiService.getDatasets();

      if (!mounted) return;

      setState(() {
        _datasets = datasets;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
      });

      _showMessage(
        error.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    }
  }

  Future<void> _startAnalysis() async {
    final objective = _objectiveController.text.trim();

    if (_selectedDatasetId == null) {
      _showMessage('Please select a dataset.', isError: true);
      return;
    }

    if (objective.length < 3) {
      _showMessage(
        'Please describe what you want the AI to analyse.',
        isError: true,
      );
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final run = await widget.apiService.createRun(
        datasetId: _selectedDatasetId!,
        objective: objective,
        maxSteps: 5,
        maxAttempts: 3,
      );

      if (!mounted) return;

      _showMessage('Analysis started successfully!');

      _objectiveController.clear();

      // Return the newly created run to the parent.
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => AnalysisDetailsScreen(
            apiService: widget.apiService,
            runId: run['id'].toString(),
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;

      _showMessage(
        error.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  void _showMessage(
    String message, {
    bool isError = false,
  }) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : null,
      ),
    );
  }

  @override
  void dispose() {
    _objectiveController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'New Analysis',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),

          const SizedBox(height: 8),

          Text(
            'Let your AI agents investigate your dataset '
            'and discover meaningful insights.',
            style: TextStyle(
              color: Colors.grey.shade600,
            ),
          ),

          const SizedBox(height: 28),

          const Text(
            'Select Dataset',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),

          const SizedBox(height: 10),

          if (_isLoading)
            const Center(child: CircularProgressIndicator())
          else if (_datasets.isEmpty)
            const Text(
              'No datasets available. Upload a dataset first.',
            )
          else
            DropdownButtonFormField<String>(
              initialValue: _selectedDatasetId,
              isExpanded: true,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: 'Choose a dataset',
              ),
              items: _datasets.map((dataset) {
                return DropdownMenuItem<String>(
                  value: dataset['id'].toString(),
                  child: Text(
                    dataset['filename']?.toString() ??
                        'Unnamed dataset',
                    overflow: TextOverflow.ellipsis,
                  ),
                );
              }).toList(),
              onChanged: (value) {
                setState(() {
                  _selectedDatasetId = value;
                });
              },
            ),

          const SizedBox(height: 28),

          const Text(
            'Analysis Objective',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),

          const SizedBox(height: 10),

          TextField(
            controller: _objectiveController,
            maxLines: 5,
            maxLength: 2000,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              alignLabelWithHint: true,
              hintText:
                  'Example: Analyze sales trends, identify '
                  'missing values, detect anomalies and '
                  'suggest business improvements.',
            ),
          ),

          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: _isSubmitting || _isLoading ||
                      _datasets.isEmpty
                  ? null
                  : _startAnalysis,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    )
                  : const Icon(Icons.auto_awesome),
              label: Text(
                _isSubmitting
                    ? 'Starting Analysis...'
                    : 'Start AI Analysis',
              ),
            ),
          ),
        ],
      ),
    );
  }
}


class _DatasetScreenState extends State<DatasetScreen> {
  static const Color blue = Color(0xFF3978F6);
  static const Color navy = Color(0xFF101828);
  static const Color muted = Color(0xFF667085);

  List<Map<String, dynamic>> _datasets = [];

  bool _isLoading = true;
  bool _isUploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDatasets();
  }

  // Fetch datasets from the backend.
  Future<void> _loadDatasets() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final datasets = await widget.apiService.getDatasets();

      if (!mounted) return;

      setState(() {
        _datasets = datasets;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  // Open native file picker and upload selected file.
 
Future<void> _pickAndUploadFile() async {
  if (_isUploading) return;

  try {
    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: [
        'csv',
        'txt',
        'xlsx',
        'xls',
        'parquet',
        'json',
      ],
    );

    // User cancelled file selection.
    if (file == null) return;

    if (file.path == null) {
      _showMessage(
        'Could not access this file. Please select it again.',
        isError: true,
      );
      return;
    }

    setState(() {
      _isUploading = true;
    });

    await widget.apiService.uploadDataset(
      filePath: file.path!,
    );

    if (!mounted) return;

    _showMessage('${file.name} uploaded successfully.');

    await _loadDatasets();
  } catch (error) {
    if (!mounted) return;

    _showMessage(
      error.toString().replaceFirst('Exception: ', ''),
      isError: true,
    );
  } finally {
    if (mounted) {
      setState(() {
        _isUploading = false;
      });
    }
  }
}


  // Delete a dataset after confirmation.
  Future<void> _deleteDataset(
    Map<String, dynamic> dataset,
  ) async {
    final id = dataset['id']?.toString();
    final filename = dataset['filename']?.toString() ?? 'this dataset';

    if (id == null || id.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Delete dataset?'),
          content: Text(
            'Are you sure you want to delete "$filename"?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              style: FilledButton.styleFrom(
                backgroundColor: Colors.red,
              ),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) return;

    try {
      await widget.apiService.deleteDataset(id);

      if (!mounted) return;

      _showMessage('$filename deleted successfully.');

      await _loadDatasets();
    } catch (error) {
      if (!mounted) return;

      _showMessage(
        error.toString().replaceFirst('Exception: ', ''),
        isError: true,
      );
    }
  }

  void _showMessage(
    String message, {
    bool isError = false,
  }) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red.shade700 : Colors.green.shade700,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  // Convert bytes into readable file size.
  String _formatSize(dynamic value) {
    final bytes = (value as num?)?.toInt() ?? 0;

    if (bytes < 1024) {
      return '$bytes B';
    }

    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }

    return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
  }

  // Format upload date.
  String _formatDate(dynamic value) {
    if (value == null) return 'Date unavailable';

    final date = DateTime.tryParse(value.toString());

    if (date == null) return 'Date unavailable';

    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/'
        '${date.year}';
  }

  IconData _fileIcon(String filename) {
    final extension = filename.split('.').last.toLowerCase();

    switch (extension) {
      case 'xlsx':
      case 'xls':
        return Icons.table_chart_outlined;
      case 'json':
        return Icons.data_object;
      case 'txt':
        return Icons.description_outlined;
      case 'parquet':
        return Icons.storage_outlined;
      default:
        return Icons.insert_drive_file_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _loadDatasets,
      color: blue,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 8),

          // HEADER
          const Text(
            'Your Datasets',
            style: TextStyle(
              fontSize: 25,
              fontWeight: FontWeight.bold,
              color: navy,
            ),
          ),

          const SizedBox(height: 8),

          const Text(
            'Upload, organize and manage your data files.',
            style: TextStyle(
              fontSize: 14,
              color: muted,
            ),
          ),

          const SizedBox(height: 24),

          // UPLOAD CARD
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: const Color(0xFFEAECF0),
              ),
            ),
            child: Column(
              children: [
                Container(
                  height: 65,
                  width: 65,
                  decoration: BoxDecoration(
                    color: blue.withValues(alpha: 0.09),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(
                    Icons.cloud_upload_outlined,
                    color: blue,
                    size: 34,
                  ),
                ),

                const SizedBox(height: 15),

                const Text(
                  'Upload your dataset',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: navy,
                  ),
                ),

                const SizedBox(height: 8),

                const Text(
                  'Select a CSV, Excel, JSON, TXT or Parquet file '
                  'from your device.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: muted,
                    fontSize: 13,
                    height: 1.5,
                  ),
                ),

                const SizedBox(height: 18),

                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton.icon(
                    onPressed: _isUploading
                        ? null
                        : _pickAndUploadFile,
                    icon: _isUploading
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.add),
                    label: Text(
                      _isUploading
                          ? 'Uploading...'
                          : 'Choose File',
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: blue,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),

                if (_isUploading) ...[
                  const SizedBox(height: 15),
                  const LinearProgressIndicator(
                    color: blue,
                    backgroundColor: Color(0xFFE4E7EC),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Please wait while your file is uploaded.',
                    style: TextStyle(
                      fontSize: 12,
                      color: muted,
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 28),

          // DATASET LIST HEADER
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Uploaded Files',
                  style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                    color: navy,
                  ),
                ),
              ),
              IconButton(
                onPressed: _isLoading ? null : _loadDatasets,
                icon: const Icon(Icons.refresh),
                tooltip: 'Refresh datasets',
              ),
            ],
          ),

          const SizedBox(height: 10),

          // LOADING STATE
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.all(35),
              child: Center(
                child: CircularProgressIndicator(color: blue),
              ),
            )

          // ERROR STATE
          else if (_error != null)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: const Color(0xFFEAECF0),
                ),
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.cloud_off_outlined,
                    size: 38,
                    color: Colors.red,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: muted),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: _loadDatasets,
                    child: const Text('Try Again'),
                  ),
                ],
              ),
            )

          // EMPTY STATE
          else if (_datasets.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: const Color(0xFFEAECF0),
                ),
              ),
              child: const Column(
                children: [
                  Icon(
                    Icons.folder_open_outlined,
                    size: 42,
                    color: Color(0xFF98A2B3),
                  ),
                  SizedBox(height: 12),
                  Text(
                    'No datasets uploaded yet',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: navy,
                      fontSize: 15,
                    ),
                  ),
                  SizedBox(height: 7),
                  Text(
                    'Choose a file above to start building '
                    'your DataPilot workspace.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: muted,
                      fontSize: 13,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            )

          // DATASET CARDS
          else
            ..._datasets.map((dataset) {
              final filename =
                  dataset['filename']?.toString() ?? 'Unknown file';

              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(
                    color: const Color(0xFFEAECF0),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      height: 48,
                      width: 48,
                      decoration: BoxDecoration(
                        color: blue.withValues(alpha: 0.09),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        _fileIcon(filename),
                        color: blue,
                        size: 25,
                      ),
                    ),

                    const SizedBox(width: 13),

                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            filename,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              color: navy,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${_formatSize(dataset['sizeBytes'])} • '
                            '${_formatDate(dataset['createdAt'])}',
                            style: const TextStyle(
                              color: muted,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),

                    IconButton(
                      onPressed: () => _deleteDataset(dataset),
                      icon: const Icon(
                        Icons.delete_outline,
                        color: Colors.red,
                      ),
                      tooltip: 'Delete dataset',
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

