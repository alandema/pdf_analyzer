import { Stack, StackProps, RemovalPolicy, DockerImage } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Construct } from 'constructs';
import { createStackParameters } from './parameters';

export class FrontendStack extends Stack {

  constructor(scope: Construct, id: string, stackEnv: string, localEnv: any, props?: StackProps) {
    super(scope, id, props);

    const frontendPath = path.join(__dirname, '../../src/frontend');

    // S3 Bucket for static website hosting
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `pdf-analyzer-frontend-${stackEnv}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: stackEnv !== 'production',
    });

    // CloudFront distribution with OAC
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(frontendPath, {
        exclude: ['node_modules', '.nuxt', '.output', '.git'],
        bundling: {
          image: DockerImage.fromRegistry('alpine'),
          local: {
            tryBundle(outputDir: string) {
              try {
                console.log('Building Nuxt frontend...');
                execSync('npm install && npm run build', { cwd: frontendPath, stdio: 'inherit' });
                const source = path.join(frontendPath, '.output', 'public');
                fs.cpSync(source, outputDir, { recursive: true });
                return true;
              } catch (error) {
                console.error('Frontend build failed:', error);
                return false;
              }
            }
          }
        }
      })],
      destinationBucket: websiteBucket,
      distribution: distribution,
      distributionPaths: ['/*'],
    });

    createStackParameters(this, stackEnv, {
      WEBSITE_URL: `https://${distribution.distributionDomainName}`
    });
  }
}
