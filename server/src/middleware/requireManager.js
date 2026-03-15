function requireManager(req, res, next) {
  if (!req.user || req.user.role !== 'manager') {
    // Log so Railway server logs reveal exactly what's in the decoded token
    console.warn(
      '[requireManager] 403 denied — uid:', req.user?.uid,
      '| role claim:', req.user?.role,
      '| email:', req.user?.email,
    );
    return res.status(403).json({ error: 'Manager access required' });
  }
  next();
}

module.exports = requireManager;
