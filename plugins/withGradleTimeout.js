const { withGradleProperties, withSettingsGradle, withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Config plugin to add Gradle timeout and retry properties, plus alternative
 * maven repositories to fix network timeout issues when downloading from Google's Maven.
 */

// Add gradle properties for timeouts
function withGradleTimeoutProperties(config) {
  return withGradleProperties(config, (config) => {
    config.modResults.push(
      {
        type: 'property',
        key: 'org.gradle.internal.http.connectionTimeout',
        value: '600000',
      },
      {
        type: 'property',
        key: 'org.gradle.internal.http.socketTimeout',
        value: '600000',
      },
      {
        type: 'property',
        key: 'org.gradle.daemon',
        value: 'true',
      },
      {
        type: 'property',
        key: 'org.gradle.parallel',
        value: 'true',
      },
      {
        type: 'property',
        key: 'org.gradle.caching',
        value: 'true',
      }
    );
    return config;
  });
}

// Add alternative repositories to settings.gradle
function withAlternativeReposSettings(config) {
  return withSettingsGradle(config, (config) => {
    const contents = config.modResults.contents;
    
    // Check if pluginManagement already has repositories block
    if (contents.includes('pluginManagement {') && !contents.includes('maven.aliyun.com')) {
      // Add repositories to pluginManagement
      const reposBlock = `  repositories {
    // Use mirror for Google Maven to avoid timeout issues
    maven {
      url 'https://maven.aliyun.com/repository/google'
      content {
        includeGroupByRegex 'com\\\\.google.*'
        includeGroupByRegex 'com\\\\.android.*'
        includeGroupByRegex 'androidx.*'
      }
    }
    google()
    mavenCentral()
    gradlePluginPortal()
  }
  `;
      
      // Insert after pluginManagement {
      config.modResults.contents = contents.replace(
        'pluginManagement {',
        `pluginManagement {\n${reposBlock}`
      );
    }
    
    return config;
  });
}

// Add alternative repositories to build.gradle
function withAlternativeReposBuildGradle(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    
    // Check if buildscript repositories already has the mirror
    if (!contents.includes('maven.aliyun.com')) {
      // Add mirror to buildscript repositories
      const mirrorRepo = `    // Use mirror for Google Maven to avoid timeout issues
    maven {
      url 'https://maven.aliyun.com/repository/google'
      content {
        includeGroupByRegex 'com\\\\.google.*'
        includeGroupByRegex 'com\\\\.android.*'
        includeGroupByRegex 'androidx.*'
      }
    }
`;
      
      // Add before google() in buildscript
      config.modResults.contents = contents.replace(
        /buildscript\s*\{\s*\n\s*repositories\s*\{\s*\n\s*google\(\)/,
        `buildscript {\n  repositories {\n${mirrorRepo}    google()`
      );
      
      // Add before google() in allprojects
      config.modResults.contents = config.modResults.contents.replace(
        /allprojects\s*\{\s*\n\s*repositories\s*\{\s*\n\s*google\(\)/,
        `allprojects {\n  repositories {\n${mirrorRepo}    google()`
      );
    }
    
    return config;
  });
}

module.exports = function withGradleTimeout(config) {
  config = withGradleTimeoutProperties(config);
  config = withAlternativeReposSettings(config);
  config = withAlternativeReposBuildGradle(config);
  return config;
};
