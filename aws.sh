#!/bin/bash
#
# define env vars for AWS Vagrantfile

export AWS_AMI="ami-d90d92ce" # Ubuntu ("Trusty") Server 14.04 LTS AMI - US-East region, HVM:EBS virtualization
export AWS_INSTANCE_TYPE="m3.xlarge"
export AWS_REGION="us-east-1"
# Make sure you set up the 'default' security group via AWS console to enable:
#   HTTP
#   SSH - preferably for your host IP only
#   Custom TCP Rule: port 3000 (for node.js app)
#   Custom TCP Rule: port 6002 (for node.js app)
export AWS_SECURITY_GROUP="default"
export AWS_KEY="your-aws-key"
export AWS_SECRETKEY="your-aws-secret-key"
export AWS_KEYPAIR="your-keypair-name"
export AWS_PEM="/path/to/your/keypair.pem"

export VAGRANT_DEFAULT_PROVIDER=aws
