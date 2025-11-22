import React, { useState, useMemo } from 'react';

interface GraphQLSchemaViewerProps {
  schema: string; 
  apiMetadata?: {
    apiInfo?: {
      apiName?: string;
      apiVersion?: string;
      apiDescription?: string;
    };
    endPoints?: {
      productionURL?: string;
      sandboxURL?: string;
    };
    provider?: string;
  };
}

interface GraphQLOperation {
  name: string;
  type: 'query' | 'mutation';
  description?: string;
  parameters?: Array<{ name: string; type: string; required: boolean }>;
  returnType: string;
  content: string;
}

interface GraphQLType {
  name: string;
  kind: 'type' | 'interface' | 'enum' | 'scalar' | 'union' | 'input';
  description?: string;
  content: string;
}

export const GraphQLSchemaViewer: React.FC<GraphQLSchemaViewerProps> = ({ schema, apiMetadata }) => {
  const [expandedOperations, setExpandedOperations] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const { operations, types } = useMemo(() => {
    if (!schema || typeof schema !== 'string') return { operations: [], types: [] };

    const ops: GraphQLOperation[] = [];
    const typeDefs: GraphQLType[] = [];
    const lines = schema.split('\n');
    
    // Helper function to parse operations from a type block
    const parseOperationsFromType = (typeName: 'Query' | 'Mutation', operationType: 'query' | 'mutation'): GraphQLOperation[] => {
      const typeOps: GraphQLOperation[] = [];
      let inTypeBlock = false;
      let braceCount = 0;
      let currentDescription = '';
      let descriptionLines: string[] = [];
      let inDescription = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
          // Empty line resets description if we're not in a multi-line description
          if (!inDescription) {
            currentDescription = '';
            descriptionLines = [];
          }
          continue;
        }

        // Detect the start of the type block
        if (trimmed === `type ${typeName}` || trimmed.startsWith(`type ${typeName} `) || trimmed.startsWith(`type ${typeName}{`)) {
          inTypeBlock = true;
          braceCount = 0;
          currentDescription = '';
          descriptionLines = [];
          inDescription = false;
          if (line.includes('{')) braceCount++;
          continue;
        }

        if (inTypeBlock) {
          if (line.includes('{')) braceCount++;
          if (line.includes('}')) braceCount--;

          // Check if this is a description line (immediately before a field)
          const isDescriptionLine = (trimmed.startsWith('"""') || trimmed.startsWith('#'));
          
          if (isDescriptionLine && braceCount > 0) {
            // Start or continue description
            inDescription = true;
            const descText = trimmed.replace(/^("""|#)/, '').replace(/"""$/, '').trim();
            if (descText) {
              descriptionLines.push(descText);
            }
            // If it's a closing triple quote, end the description
            if (trimmed.endsWith('"""') && trimmed.startsWith('"""') && trimmed.length > 3) {
              inDescription = false;
            }
            continue;
          }

          // If we were in a description and hit a non-description line, finalize it
          if (inDescription && !isDescriptionLine && braceCount > 0) {
            currentDescription = descriptionLines.join(' ').trim();
            inDescription = false;
          }

          // Parse operation fields
          if (braceCount > 0 && !isDescriptionLine) {
            const fieldMatch = trimmed.match(/^\s*(\w+)\s*(\([^)]*\))?\s*:\s*(.+?)(\s*\{|\s*$)/);
            
            if (fieldMatch) {
              const operationName = fieldMatch[1];
              const paramsString = fieldMatch[2] || '';
              let returnType = fieldMatch[3].trim();
              returnType = returnType.replace(/\s*\{.*$/, '').trim();

              const parameters: Array<{ name: string; type: string; required: boolean }> = [];
              if (paramsString) {
                const paramsContent = paramsString.replace(/[()]/g, '');
                const paramMatches = Array.from(paramsContent.matchAll(/(\w+)\s*:\s*([^,]+)/g));
                for (const match of paramMatches) {
                  const paramName = match[1];
                  const paramType = match[2].trim();
                  const required = paramType.includes('!');
                  parameters.push({
                    name: paramName,
                    type: paramType.replace(/!/g, '').trim(),
                    required
                  });
                }
              }

              // Only use description if it was immediately before this field
              const description = currentDescription.trim() || undefined;
              
              typeOps.push({
                name: operationName,
                type: operationType,
                description: description,
                parameters: parameters.length > 0 ? parameters : undefined,
                returnType: returnType.replace(/[!,]/g, '').trim(),
                content: line.trim()
              });

              // Reset description after using it
              currentDescription = '';
              descriptionLines = [];
            } else {
              // If this line doesn't match a field pattern and we have a description, clear it
              // (it might be a comment or unrelated line)
              if (currentDescription && !trimmed.startsWith('#') && !trimmed.startsWith('"""')) {
                currentDescription = '';
                descriptionLines = [];
              }
            }
          }

          if (braceCount === 0 && trimmed.includes('}')) {
            inTypeBlock = false;
            break;
          }
        }
      }

      return typeOps;
    };

    // Parse Query operations
    const queryOps = parseOperationsFromType('Query', 'query');
    ops.push(...queryOps);

    // Parse Mutation operations
    const mutationOps = parseOperationsFromType('Mutation', 'mutation');
    ops.push(...mutationOps);

    // Parse Types (excluding Query, Mutation, Subscription)
    let currentType: GraphQLType | null = null;
    let currentDescription = '';
    let braceCount = 0;
    let inType = false;
    let typeContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) continue;

      // Capture descriptions
      if ((trimmed.startsWith('"""') || trimmed.startsWith('#')) && !inType) {
        currentDescription += trimmed.replace(/^("""|#)/, '').replace(/"""$/, '').trim() + ' ';
        continue;
      }

      // Detect type definitions (excluding Query, Mutation, Subscription)
      if (trimmed.startsWith('type ') || trimmed.startsWith('interface ') || trimmed.startsWith('enum ') || 
          trimmed.startsWith('scalar ') || trimmed.startsWith('union ') || trimmed.startsWith('input ')) {
        const match = trimmed.match(/^(type|interface|enum|scalar|union|input)\s+(\w+)/);
        if (match) {
          const typeName = match[2];
          // Skip Query, Mutation, Subscription as they're handled separately
          if (typeName === 'Query' || typeName === 'Mutation' || typeName === 'Subscription') {
            continue;
          }

          if (currentType) {
            currentType.content = typeContent.join('\n');
            typeDefs.push(currentType);
          }

          const kind = match[1] as GraphQLType['kind'];
          currentType = {
            name: typeName,
            kind,
            description: currentDescription.trim() || undefined,
            content: ''
          };
          typeContent = [line];
          currentDescription = '';
          inType = true;
          braceCount = 0;

          if (line.includes('{')) braceCount++;
          if (line.includes('}')) braceCount--;
        }
      } else if (inType && currentType) {
        typeContent.push(line);
        if (line.includes('{')) braceCount++;
        if (line.includes('}')) braceCount--;

        if (braceCount === 0 && (line.includes('}') || currentType.kind === 'scalar' || currentType.kind === 'union')) {
          currentType.content = typeContent.join('\n');
          typeDefs.push(currentType);
          currentType = null;
          typeContent = [];
          inType = false;
        }
      } else {
        currentDescription = '';
      }
    }

    if (currentType) {
      currentType.content = typeContent.join('\n');
      typeDefs.push(currentType);
    }

    return { operations: ops, types: typeDefs };
  }, [schema]);

  const queries = operations.filter(op => op.type === 'query');
  const mutations = operations.filter(op => op.type === 'mutation');

  const toggleOperation = (operationName: string) => {
    const newExpanded = new Set(expandedOperations);
    if (newExpanded.has(operationName)) {
      newExpanded.delete(operationName);
    } else {
      newExpanded.add(operationName);
    }
    setExpandedOperations(newExpanded);
  };

  const toggleSection = (sectionName: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionName)) {
      newExpanded.delete(sectionName);
    } else {
      newExpanded.add(sectionName);
    }
    setExpandedSections(newExpanded);
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      query: '#0066cc',
      mutation: '#d73a49',
      type: '#0066cc',
      interface: '#6f42c1',
      enum: '#22863a',
      scalar: '#6a737d',
      union: '#d73a49',
      input: '#005cc5'
    };
    return colors[type] || '#24292e';
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      query: 'Q',
      mutation: 'M',
      type: 'T',
      interface: 'I',
      enum: 'E',
      scalar: 'S',
      union: 'U',
      input: 'IN'
    };
    return icons[type] || '?';
  };

  return (
    <div style={{
      padding: '24px',
      backgroundColor: '#f6f8fa',
      minHeight: '100vh',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        backgroundColor: 'white', 
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e1e4e8',
          backgroundColor: '#fafbfc'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            color: '#24292e',
            fontSize: '24px',
            fontWeight: 600
          }}>
            {apiMetadata?.apiInfo?.apiName || 'GraphQL Schema Documentation'}
            {apiMetadata?.apiInfo?.apiVersion && (
              <span style={{
                fontSize: '18px',
                fontWeight: 400,
                color: '#6a737d',
                marginLeft: '12px'
              }}>
                {apiMetadata.apiInfo.apiVersion}
              </span>
            )}
          </h2>
          
          {/* Endpoints */}
          {apiMetadata && (apiMetadata.endPoints?.productionURL || apiMetadata.endPoints?.sandboxURL) && (
            <div style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              {apiMetadata.endPoints.productionURL && (
                <div style={{
                  flex: '1 1 300px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e1e4e8',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#22863a';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(34, 134, 58, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e1e4e8';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onClick={async () => {
                  try {
                    if (apiMetadata.endPoints?.productionURL) {
                      await navigator.clipboard.writeText(apiMetadata.endPoints.productionURL);
                      setCopiedEndpoint('production');
                      setTimeout(() => setCopiedEndpoint(null), 2000);
                    }
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                }}
                title="Click to copy">
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#22863a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 2L2 7L10 12L18 7L10 2Z" fill="white"/>
                      <path d="M2 13L10 18L18 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 10L10 15L18 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#22863a',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '4px'
                    }}>
                      Endpoint
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#24292e',
                      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                      wordBreak: 'break-all',
                      lineHeight: '1.4'
                    }}>
                      {apiMetadata.endPoints.productionURL}
                    </div>
                  </div>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {copiedEndpoint === 'production' && (
                      <div style={{
                        position: 'absolute',
                        top: '-40px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '6px 12px',
                        backgroundColor: '#24292e',
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        pointerEvents: 'none'
                      }}>
                        Copied!
                        <div style={{
                          position: 'absolute',
                          bottom: '-4px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 0,
                          height: 0,
                          borderLeft: '4px solid transparent',
                          borderRight: '4px solid transparent',
                          borderTop: '4px solid #24292e'
                        }} />
                      </div>
                    )}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, opacity: 0.5 }}>
                      <path d="M4 2H12C13.1 2 14 2.9 14 4V12C14 13.1 13.1 14 12 14H4C2.9 14 2 13.1 2 12V4C2 2.9 2.9 2 4 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M6 6H10M6 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
              )}
              {apiMetadata.endPoints.sandboxURL && (
                <div style={{
                  flex: '1 1 300px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e1e4e8',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#d73a49';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(215, 58, 73, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e1e4e8';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onClick={async () => {
                  try {
                    if (apiMetadata.endPoints?.sandboxURL) {
                      await navigator.clipboard.writeText(apiMetadata.endPoints.sandboxURL);
                      setCopiedEndpoint('sandbox');
                      setTimeout(() => setCopiedEndpoint(null), 2000);
                    }
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                }}
                title="Click to copy">
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#d73a49',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 2L2 7L10 12L18 7L10 2Z" fill="white"/>
                      <path d="M2 13L10 18L18 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 10L10 15L18 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#d73a49',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '4px'
                    }}>
                      Sandbox
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#24292e',
                      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                      wordBreak: 'break-all',
                      lineHeight: '1.4'
                    }}>
                      {apiMetadata.endPoints.sandboxURL}
                    </div>
                  </div>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {copiedEndpoint === 'sandbox' && (
                      <div style={{
                        position: 'absolute',
                        top: '-40px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '6px 12px',
                        backgroundColor: '#24292e',
                        color: 'white',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        pointerEvents: 'none'
                      }}>
                        Copied!
                        <div style={{
                          position: 'absolute',
                          bottom: '-4px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 0,
                          height: 0,
                          borderLeft: '4px solid transparent',
                          borderRight: '4px solid transparent',
                          borderTop: '4px solid #24292e'
                        }} />
                      </div>
                    )}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, opacity: 0.5 }}>
                      <path d="M4 2H12C13.1 2 14 2.9 14 4V12C14 13.1 13.1 14 12 14H4C2.9 14 2 13.1 2 12V4C2 2.9 2.9 2 4 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M6 6H10M6 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '16px' }}>
          {/* Queries Section */}
          <div style={{
            marginBottom: '24px',
            border: '1px solid #e1e4e8',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div
              onClick={() => toggleSection('queries')}
              style={{
                padding: '16px',
                backgroundColor: '#fafbfc',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: expandedSections.has('queries') ? '1px solid #e1e4e8' : 'none',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: '#0066cc',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  Q
                </div>
                <div>
                  <h3 style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#24292e'
                  }}>
                    Queries
                  </h3>
                  <div style={{
                    fontSize: '13px',
                    color: '#6a737d',
                    marginTop: '4px'
                  }}>
                    {queries.length} operation{queries.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '20px',
                color: '#6a737d',
                transition: 'transform 0.2s',
                transform: expandedSections.has('queries') ? 'rotate(90deg)' : 'rotate(0deg)'
              }}>
                ›
              </span>
            </div>

            {expandedSections.has('queries') && (
              <div style={{ padding: '16px' }}>
                {queries.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6a737d' }}>
                    No queries found
                  </div>
                ) : (
                  queries.map((operation) => (
                    <div
                      key={`query-${operation.name}`}
                      style={{
                        marginBottom: '12px',
                        border: '1px solid #e1e4e8',
                        borderRadius: '6px',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <div
                        onClick={() => toggleOperation(`query-${operation.name}`)}
                        style={{
                          padding: '12px 16px',
                          backgroundColor: '#fafbfc',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontWeight: 600,
                            color: '#24292e',
                            fontSize: '16px',
                            marginBottom: '4px'
                          }}>
                            {operation.name}
                          </div>
                          {operation.description && (
                            <div style={{
                              fontSize: '13px',
                              color: '#6a737d',
                              marginBottom: '4px'
                            }}>
                              {operation.description}
                            </div>
                          )}
                          <div style={{
                            fontSize: '13px',
                            color: '#6a737d',
                            fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace"
                          }}>
                            → {operation.returnType}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '18px',
                          color: '#6a737d',
                          transition: 'transform 0.2s',
                          transform: expandedOperations.has(`query-${operation.name}`) ? 'rotate(90deg)' : 'rotate(0deg)'
                        }}>
                          ›
                        </span>
                      </div>

                      {expandedOperations.has(`query-${operation.name}`) && (
                        <div style={{
                          padding: '16px',
                          backgroundColor: 'white',
                          borderTop: '1px solid #e1e4e8'
                        }}>
                          {operation.parameters && operation.parameters.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                              <h4 style={{
                                margin: '0 0 8px 0',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#24292e'
                              }}>
                                Parameters
                              </h4>
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                {operation.parameters.map((param, idx) => (
                                  <div key={idx} style={{
                                    padding: '8px 12px',
                                    backgroundColor: '#f6f8fa',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                  }}>
                                    <span style={{
                                      fontWeight: 600,
                                      color: '#24292e',
                                      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace"
                                    }}>
                                      {param.name}
                                    </span>
                                    <span style={{ color: '#6a737d' }}>:</span>
                                    <span style={{
                                      color: '#005cc5',
                                      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace"
                                    }}>
                                      {param.type}
                                    </span>
                                    {param.required && (
                                      <span style={{
                                        color: '#d73a49',
                                        fontSize: '12px'
                                      }}>
                                        (required)
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div>
                            <h4 style={{
                              margin: '0 0 8px 0',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: '#24292e'
                            }}>
                              Schema Definition
                            </h4>
                            <pre style={{
                              margin: 0,
                              padding: '12px',
                              backgroundColor: '#f6f8fa',
                              borderRadius: '6px',
                              fontSize: '13px',
                              lineHeight: '1.6',
                              overflow: 'auto',
                              fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                              color: '#24292e'
                            }}>
                              {operation.content}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Mutations Section */}
          <div style={{
            marginBottom: '24px',
            border: '1px solid #e1e4e8',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div
              onClick={() => toggleSection('mutations')}
              style={{
                padding: '16px',
                backgroundColor: '#fafbfc',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: expandedSections.has('mutations') ? '1px solid #e1e4e8' : 'none',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: '#d73a49',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  M
                </div>
                <div>
                  <h3 style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#24292e'
                  }}>
                    Mutations
                  </h3>
                  <div style={{
                    fontSize: '13px',
                    color: '#6a737d',
                    marginTop: '4px'
                  }}>
                    {mutations.length} operation{mutations.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '20px',
                color: '#6a737d',
                transition: 'transform 0.2s',
                transform: expandedSections.has('mutations') ? 'rotate(90deg)' : 'rotate(0deg)'
              }}>
                ›
              </span>
            </div>

            {expandedSections.has('mutations') && (
              <div style={{ padding: '16px' }}>
                {mutations.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6a737d' }}>
                    No mutations found
                  </div>
                ) : (
                  mutations.map((operation) => (
                    <div
                      key={`mutation-${operation.name}`}
                      style={{
                        marginBottom: '12px',
                        border: '1px solid #e1e4e8',
                        borderRadius: '6px',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <div
                        onClick={() => toggleOperation(`mutation-${operation.name}`)}
                        style={{
                          padding: '12px 16px',
                          backgroundColor: '#fafbfc',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontWeight: 600,
                            color: '#24292e',
                            fontSize: '16px',
                            marginBottom: '4px'
                          }}>
                            {operation.name}
                          </div>
                          {operation.description && (
                            <div style={{
                              fontSize: '13px',
                              color: '#6a737d',
                              marginBottom: '4px'
                            }}>
                              {operation.description}
                            </div>
                          )}
                          <div style={{
                            fontSize: '13px',
                            color: '#6a737d',
                            fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace"
                          }}>
                            → {operation.returnType}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '18px',
                          color: '#6a737d',
                          transition: 'transform 0.2s',
                          transform: expandedOperations.has(`mutation-${operation.name}`) ? 'rotate(90deg)' : 'rotate(0deg)'
                        }}>
                          ›
                        </span>
                      </div>

                      {expandedOperations.has(`mutation-${operation.name}`) && (
                        <div style={{
                          padding: '16px',
                          backgroundColor: 'white',
                          borderTop: '1px solid #e1e4e8'
                        }}>
                          {operation.parameters && operation.parameters.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                              <h4 style={{
                                margin: '0 0 8px 0',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#24292e'
                              }}>
                                Parameters
                              </h4>
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                {operation.parameters.map((param, idx) => (
                                  <div key={idx} style={{
                                    padding: '8px 12px',
                                    backgroundColor: '#f6f8fa',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                  }}>
                                    <span style={{
                                      fontWeight: 600,
                                      color: '#24292e',
                                      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace"
                                    }}>
                                      {param.name}
                                    </span>
                                    <span style={{ color: '#6a737d' }}>:</span>
                                    <span style={{
                                      color: '#005cc5',
                                      fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace"
                                    }}>
                                      {param.type}
                                    </span>
                                    {param.required && (
                                      <span style={{
                                        color: '#d73a49',
                                        fontSize: '12px'
                                      }}>
                                        (required)
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div>
                            <h4 style={{
                              margin: '0 0 8px 0',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: '#24292e'
                            }}>
                              Schema Definition
                            </h4>
                            <pre style={{
                              margin: 0,
                              padding: '12px',
                              backgroundColor: '#f6f8fa',
                              borderRadius: '6px',
                              fontSize: '13px',
                              lineHeight: '1.6',
                              overflow: 'auto',
                              fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                              color: '#24292e'
                            }}>
                              {operation.content}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Types Section */}
          <div style={{
            marginBottom: '24px',
            border: '1px solid #e1e4e8',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div
              onClick={() => toggleSection('types')}
              style={{
                padding: '16px',
                backgroundColor: '#fafbfc',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: expandedSections.has('types') ? '1px solid #e1e4e8' : 'none',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: '#6a737d',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  T
                </div>
                <div>
                  <h3 style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#24292e'
                  }}>
                    Types
                  </h3>
                  <div style={{
                    fontSize: '13px',
                    color: '#6a737d',
                    marginTop: '4px'
                  }}>
                    {types.length} type{types.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '20px',
                color: '#6a737d',
                transition: 'transform 0.2s',
                transform: expandedSections.has('types') ? 'rotate(90deg)' : 'rotate(0deg)'
              }}>
                ›
              </span>
            </div>

            {expandedSections.has('types') && (
              <div style={{ padding: '16px' }}>
                {types.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6a737d' }}>
                    No types found
                  </div>
                ) : (
                  types.map((type) => (
                    <div
                      key={`type-${type.name}`}
                      style={{
                        marginBottom: '12px',
                        border: '1px solid #e1e4e8',
                        borderRadius: '6px',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <div
                        onClick={() => toggleOperation(`type-${type.name}`)}
                        style={{
                          padding: '12px 16px',
                          backgroundColor: '#fafbfc',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          backgroundColor: getTypeColor(type.kind),
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}>
                          {getTypeIcon(type.kind)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontWeight: 600,
                            color: '#24292e',
                            fontSize: '16px',
                            marginBottom: '4px'
                          }}>
                            {type.name}
                          </div>
                          {type.description && (
                            <div style={{
                              fontSize: '13px',
                              color: '#6a737d',
                              marginBottom: '4px'
                            }}>
                              {type.description}
                            </div>
                          )}
                          <span style={{
                            fontSize: '12px',
                            color: '#6a737d',
                            padding: '2px 8px',
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            border: '1px solid #e1e4e8'
                          }}>
                            {type.kind}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '18px',
                          color: '#6a737d',
                          transition: 'transform 0.2s',
                          transform: expandedOperations.has(`type-${type.name}`) ? 'rotate(90deg)' : 'rotate(0deg)'
                        }}>
                          ›
                        </span>
                      </div>

                      {expandedOperations.has(`type-${type.name}`) && (
                        <div style={{
                          padding: '16px',
                          backgroundColor: 'white',
                          borderTop: '1px solid #e1e4e8'
                        }}>
                          <pre style={{
                            margin: 0,
                            padding: '12px',
                            backgroundColor: '#f6f8fa',
                            borderRadius: '6px',
                            fontSize: '13px',
                            lineHeight: '1.6',
                            overflow: 'auto',
                            fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
                            color: '#24292e'
                          }}>
                            {type.content}
      </pre>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphQLSchemaViewer;
